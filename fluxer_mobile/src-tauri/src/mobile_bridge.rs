use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::Duration,
};
use tauri::{
    plugin::{Builder as PluginBuilder, PluginHandle, TauriPlugin},
    AppHandle, Manager, State, Wry,
};
use tokio::sync::watch;

#[cfg(target_os = "android")]
use futures_util::{SinkExt, StreamExt};
#[cfg(target_os = "android")]
use serde_json::json;
#[cfg(target_os = "android")]
use tokio_tungstenite::{connect_async, tungstenite::Message};
#[cfg(target_os = "android")]
use url::Url;

const DEFAULT_API_VERSION: u32 = 1;
const GATEWAY_HELLO_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BACKOFF_SECS: u64 = 30;
const MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS: u64 = 1 << 12;
const OP_DISPATCH: u8 = 0;
const OP_HEARTBEAT: u8 = 1;
const OP_IDENTIFY: u8 = 2;
const OP_RECONNECT: u8 = 7;
const OP_INVALID_SESSION: u8 = 9;
const OP_HELLO: u8 = 10;
const OP_HEARTBEAT_ACK: u8 = 11;

pub fn init() -> TauriPlugin<Wry> {
    PluginBuilder::new("rdchat-mobile")
        .setup(|app, _api| {
            app.manage(MobileBridgeState::default());

            #[cfg(target_os = "android")]
            {
                let handle = _api
                    .register_android_plugin("ru.rdchat.mobile", "RdchatMobilePlugin")
                    .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
                let state = app.state::<MobileBridgeState>();
                *state.android_plugin.lock().unwrap() = Some(handle);
            }

            Ok(())
        })
        .build()
}

#[derive(Default)]
pub struct MobileBridgeState {
    android_plugin: Mutex<Option<PluginHandle<Wry>>>,
    supervisor: Mutex<PushSupervisor>,
}

#[derive(Default)]
struct PushSupervisor {
    listeners: HashMap<String, AccountListener>,
}

struct AccountListener {
    config: AccountListenerConfig,
    stop_tx: watch::Sender<bool>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl AccountListener {
    fn stop(self) {
        let _ = self.stop_tx.send(true);
        self.task.abort();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushSyncPayload {
    pub enabled: bool,
    pub app_focused: bool,
    pub suppress_while_focused: bool,
    #[serde(default)]
    pub accounts: Vec<PushSyncAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushSyncAccount {
    pub user_id: String,
    pub token: String,
    pub gateway_endpoint: String,
    pub web_app_endpoint: String,
    pub relay_directory_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AccountListenerConfig {
    account: PushSyncAccount,
    app_focused: bool,
    suppress_while_focused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationClickPayload {
    pub url: String,
    pub target_user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionRequestArgs {
    permissions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenSettingsArgs {
    kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStateArgs {
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeNotificationPayload {
    id: String,
    title: String,
    body: String,
    url: String,
    target_user_id: String,
}

#[derive(Debug, Deserialize)]
struct GatewayEnvelope {
    op: u8,
    #[serde(default)]
    d: Option<Value>,
    #[serde(default)]
    s: Option<u64>,
    #[serde(default)]
    t: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelloPayload {
    heartbeat_interval: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct GatewayUser {
    id: String,
    username: String,
    #[serde(default)]
    global_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GatewayAttachment {
    filename: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GatewayEmbedField {
    name: String,
    value: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GatewayEmbed {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    fields: Vec<GatewayEmbedField>,
}

#[derive(Debug, Clone, Deserialize)]
struct GatewayMessageCreate {
    id: String,
    channel_id: String,
    #[serde(default)]
    guild_id: Option<String>,
    author: GatewayUser,
    #[serde(default)]
    content: String,
    #[serde(default)]
    mention_everyone: bool,
    #[serde(default)]
    mentions: Vec<GatewayUser>,
    #[serde(default)]
    attachments: Vec<GatewayAttachment>,
    #[serde(default)]
    embeds: Vec<GatewayEmbed>,
    #[serde(default)]
    flags: u64,
}

#[derive(Default)]
struct SeenMessages {
    ids: VecDeque<String>,
}

impl SeenMessages {
    fn insert(&mut self, id: &str) -> bool {
        if self.ids.iter().any(|existing| existing == id) {
            return false;
        }

        self.ids.push_back(id.to_owned());
        while self.ids.len() > 256 {
            self.ids.pop_front();
        }

        true
    }
}

#[tauri::command]
pub async fn mobile_check_permissions(
    state: State<'_, MobileBridgeState>,
    permissions: Option<Vec<String>>,
) -> Result<HashMap<String, String>, String> {
    let _ = (&state, &permissions);

    #[cfg(target_os = "android")]
    {
        let plugin = android_plugin_handle(&state)?;
        let mut result: HashMap<String, String> = plugin
            .run_mobile_plugin_async("checkPermissions", json!({}))
            .await
            .map_err(|error| error.to_string())?;

        if let Some(requested) = permissions {
            result.retain(|key, _| requested.iter().any(|candidate| candidate == key));
        }

        return Ok(result);
    }

    #[allow(unreachable_code)]
    Ok(HashMap::new())
}

#[tauri::command]
pub async fn mobile_request_permissions(
    state: State<'_, MobileBridgeState>,
    permissions: Option<Vec<String>>,
) -> Result<HashMap<String, String>, String> {
    let _ = (&state, &permissions);

    #[cfg(target_os = "android")]
    {
        let plugin = android_plugin_handle(&state)?;
        return plugin
            .run_mobile_plugin_async("requestPermissions", PermissionRequestArgs { permissions })
            .await
            .map_err(|error| error.to_string());
    }

    #[allow(unreachable_code)]
    Ok(HashMap::new())
}

#[tauri::command]
pub async fn mobile_open_permission_settings(
    state: State<'_, MobileBridgeState>,
    kind: String,
) -> Result<(), String> {
    let _ = (&state, &kind);

    #[cfg(target_os = "android")]
    {
        let plugin = android_plugin_handle(&state)?;
        let _: Value = plugin
            .run_mobile_plugin_async("openSettings", OpenSettingsArgs { kind })
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub async fn mobile_consume_notification_clicks(
    state: State<'_, MobileBridgeState>,
) -> Result<Vec<NotificationClickPayload>, String> {
    let _ = &state;

    #[cfg(target_os = "android")]
    {
        let plugin = android_plugin_handle(&state)?;
        return plugin
            .run_mobile_plugin_async("takePendingNotificationClicks", json!({}))
            .await
            .map_err(|error| error.to_string());
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
}

#[tauri::command]
pub async fn mobile_sync_push_state(
    app: AppHandle<Wry>,
    state: State<'_, MobileBridgeState>,
    payload: PushSyncPayload,
) -> Result<(), String> {
    let _ = (&app, &state, &payload);

    #[cfg(target_os = "android")]
    {
        let plugin = android_plugin_handle(&state)?;
        sync_android_push_state(app, &state, plugin, payload).await?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[cfg(target_os = "android")]
fn android_plugin_handle(
    state: &State<'_, MobileBridgeState>,
) -> Result<PluginHandle<Wry>, String> {
    state
        .android_plugin
        .lock()
        .map_err(|_| "Failed to lock Android plugin handle".to_owned())?
        .clone()
        .ok_or_else(|| "Android mobile bridge is not initialized".to_owned())
}

#[cfg(target_os = "android")]
async fn sync_android_push_state(
    app: AppHandle<Wry>,
    state: &State<'_, MobileBridgeState>,
    plugin: PluginHandle<Wry>,
    payload: PushSyncPayload,
) -> Result<(), String> {
    let desired_accounts: HashMap<String, AccountListenerConfig> = payload
        .accounts
        .into_iter()
        .filter_map(|account| {
            if !payload.enabled {
                return None;
            }

            if account.user_id.trim().is_empty()
                || account.token.trim().is_empty()
                || account.gateway_endpoint.trim().is_empty()
            {
                return None;
            }

            if account
                .relay_directory_url
                .as_ref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
            {
                return None;
            }

            Some((
                account.user_id.clone(),
                AccountListenerConfig {
                    account,
                    app_focused: payload.app_focused,
                    suppress_while_focused: payload.suppress_while_focused,
                },
            ))
        })
        .collect();

    let mut supervisor = state
        .supervisor
        .lock()
        .map_err(|_| "Failed to lock push supervisor".to_owned())?;

    let existing_user_ids: Vec<String> = supervisor.listeners.keys().cloned().collect();
    for user_id in existing_user_ids {
        let should_keep = supervisor
            .listeners
            .get(&user_id)
            .and_then(|listener| {
                desired_accounts
                    .get(&user_id)
                    .map(|desired| listener.config == *desired)
            })
            .unwrap_or(false);

        if !should_keep {
            if let Some(listener) = supervisor.listeners.remove(&user_id) {
                listener.stop();
            }
        }
    }

    for (user_id, config) in desired_accounts {
        if supervisor.listeners.contains_key(&user_id) {
            continue;
        }

        let (stop_tx, stop_rx) = watch::channel(false);
        let task = tauri::async_runtime::spawn(run_account_listener(
            app.clone(),
            plugin.clone(),
            config.clone(),
            stop_rx,
        ));

        supervisor.listeners.insert(
            user_id,
            AccountListener {
                config,
                stop_tx,
                task,
            },
        );
    }

    let service_enabled = !supervisor.listeners.is_empty();
    drop(supervisor);

    let _: Value = plugin
        .run_mobile_plugin_async(
            "setListenerServiceState",
            ServiceStateArgs {
                enabled: service_enabled,
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(target_os = "android")]
async fn run_account_listener(
    _app: AppHandle<Wry>,
    plugin: PluginHandle<Wry>,
    config: AccountListenerConfig,
    mut stop_rx: watch::Receiver<bool>,
) {
    let mut backoff_secs = 1_u64;
    let mut seen_messages = SeenMessages::default();

    loop {
        if should_stop(&stop_rx) {
            break;
        }

        let result = listen_to_gateway(&plugin, &config, &mut stop_rx, &mut seen_messages).await;
        if should_stop(&stop_rx) {
            break;
        }

        if let Err(error) = result {
            eprintln!(
                "[rdchat-mobile] gateway listener for {} disconnected: {}",
                config.account.user_id, error
            );
        }

        let delay = tokio::time::sleep(Duration::from_secs(backoff_secs));
        tokio::pin!(delay);
        tokio::select! {
            _ = stop_rx.changed() => {
                if should_stop(&stop_rx) {
                    break;
                }
            }
            _ = &mut delay => {}
        }

        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
    }
}

#[cfg(target_os = "android")]
async fn listen_to_gateway(
    plugin: &PluginHandle<Wry>,
    config: &AccountListenerConfig,
    stop_rx: &mut watch::Receiver<bool>,
    seen_messages: &mut SeenMessages,
) -> Result<(), String> {
    let gateway_url = build_gateway_url(&config.account.gateway_endpoint)?;
    let (mut socket, _) = connect_async(gateway_url.as_str())
        .await
        .map_err(|error| error.to_string())?;

    let hello_timeout = tokio::time::sleep(GATEWAY_HELLO_TIMEOUT);
    tokio::pin!(hello_timeout);
    let mut heartbeat: Option<tokio::time::Interval> = None;
    let mut last_sequence: Option<u64> = None;
    let mut awaiting_heartbeat_ack = false;

    loop {
        let waiting_for_hello = heartbeat.is_none();
        let heartbeat_tick = async {
            match heartbeat.as_mut() {
                Some(interval) => {
                    interval.tick().await;
                }
                None => std::future::pending::<()>().await,
            }
        };

        tokio::select! {
            _ = stop_rx.changed() => {
                if should_stop(stop_rx) {
                    let _ = socket.close(None).await;
                    return Ok(());
                }
            }
            _ = &mut hello_timeout, if waiting_for_hello => {
                return Err("Timed out waiting for gateway HELLO".to_owned());
            }
            _ = heartbeat_tick => {
                if awaiting_heartbeat_ack {
                    return Err("Gateway heartbeat timed out".to_owned());
                }

                awaiting_heartbeat_ack = true;
                send_gateway_payload(
                    &mut socket,
                    json!({
                        "op": OP_HEARTBEAT,
                        "d": last_sequence
                    }),
                ).await?;
            }
            message = socket.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => {
                        handle_gateway_text_message(
                            plugin,
                            config,
                            seen_messages,
                            &mut socket,
                            text.as_ref(),
                            &mut heartbeat,
                            &mut awaiting_heartbeat_ack,
                            &mut last_sequence,
                        ).await?;
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        let text = String::from_utf8(bytes.to_vec()).map_err(|error| error.to_string())?;
                        handle_gateway_text_message(
                            plugin,
                            config,
                            seen_messages,
                            &mut socket,
                            &text,
                            &mut heartbeat,
                            &mut awaiting_heartbeat_ack,
                            &mut last_sequence,
                        ).await?;
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        socket.send(Message::Pong(payload)).await.map_err(|error| error.to_string())?;
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let reason = frame
                            .map(|close| format!("{} {}", close.code, close.reason))
                            .unwrap_or_else(|| "gateway closed the socket".to_owned());
                        return Err(reason);
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => return Err(error.to_string()),
                    None => return Err("Gateway socket ended".to_owned()),
                }
            }
        }
    }
}

#[cfg(target_os = "android")]
async fn handle_gateway_text_message(
    plugin: &PluginHandle<Wry>,
    config: &AccountListenerConfig,
    seen_messages: &mut SeenMessages,
    socket: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    text: &str,
    heartbeat: &mut Option<tokio::time::Interval>,
    awaiting_heartbeat_ack: &mut bool,
    last_sequence: &mut Option<u64>,
) -> Result<(), String> {
    let payload: GatewayEnvelope = serde_json::from_str(text).map_err(|error| error.to_string())?;
    *last_sequence = payload.s.or(*last_sequence);

    match payload.op {
        OP_HELLO => {
            let hello: HelloPayload = serde_json::from_value(payload.d.unwrap_or(Value::Null))
                .map_err(|error| error.to_string())?;
            let interval_ms = hello.heartbeat_interval.max(1_000);
            let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            *heartbeat = Some(interval);
            let token = config.account.token.clone();

            send_gateway_payload(
                socket,
                json!({
                    "op": OP_IDENTIFY,
                    "d": {
                        "token": token,
                        "properties": {
                            "os": "android",
                            "browser": "tauri-mobile",
                            "device": "rdchat-mobile",
                            "locale": "en-US",
                            "user_agent": "RdChat Mobile",
                            "browser_version": "1",
                            "os_version": "android",
                            "build_timestamp": "native-push"
                        },
                        "flags": 0
                    }
                }),
            )
            .await?;
        }
        OP_HEARTBEAT => {
            send_gateway_payload(
                socket,
                json!({
                    "op": OP_HEARTBEAT,
                    "d": *last_sequence
                }),
            )
            .await?;
        }
        OP_HEARTBEAT_ACK => {
            *awaiting_heartbeat_ack = false;
        }
        OP_RECONNECT | OP_INVALID_SESSION => {
            return Err(format!(
                "Gateway requested reconnect with opcode {}",
                payload.op
            ));
        }
        OP_DISPATCH => {
            if payload.t.as_deref() == Some("MESSAGE_CREATE") {
                let message: GatewayMessageCreate =
                    serde_json::from_value(payload.d.unwrap_or(Value::Null))
                        .map_err(|error| error.to_string())?;

                if !seen_messages.insert(&message.id) {
                    return Ok(());
                }

                if let Some(notification) = build_notification_payload(config, &message) {
                    let _: Value = plugin
                        .run_mobile_plugin_async("showNotification", notification)
                        .await
                        .map_err(|error| error.to_string())?;
                }
            }
        }
        _ => {}
    }

    Ok(())
}

#[cfg(target_os = "android")]
async fn send_gateway_payload(
    socket: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    payload: Value,
) -> Result<(), String> {
    socket
        .send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "android")]
fn build_gateway_url(raw_endpoint: &str) -> Result<Url, String> {
    let mut url = Url::parse(raw_endpoint).map_err(|error| error.to_string())?;
    match url.scheme() {
        "http" => {
            url.set_scheme("ws")
                .map_err(|_| "Failed to convert gateway URL to ws".to_owned())?;
        }
        "https" => {
            url.set_scheme("wss")
                .map_err(|_| "Failed to convert gateway URL to wss".to_owned())?;
        }
        "ws" | "wss" => {}
        other => {
            return Err(format!("Unsupported gateway URL scheme: {other}"));
        }
    }

    url.query_pairs_mut()
        .clear()
        .append_pair("v", &DEFAULT_API_VERSION.to_string())
        .append_pair("encoding", "json")
        .append_pair("compress", "none");

    Ok(url)
}

#[cfg(target_os = "android")]
fn should_stop(stop_rx: &watch::Receiver<bool>) -> bool {
    *stop_rx.borrow()
}

#[cfg(target_os = "android")]
fn build_notification_payload(
    config: &AccountListenerConfig,
    message: &GatewayMessageCreate,
) -> Option<NativeNotificationPayload> {
    if config.suppress_while_focused && config.app_focused {
        return None;
    }

    if message.author.id == config.account.user_id {
        return None;
    }

    if message.flags & MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS != 0 {
        return None;
    }

    let is_direct_message = message.guild_id.is_none();
    let is_mention = message.mention_everyone
        || message
            .mentions
            .iter()
            .any(|user| user.id == config.account.user_id);

    if !is_direct_message && !is_mention {
        return None;
    }

    let title = if is_direct_message {
        display_name(&message.author)
    } else {
        format!("{} mentioned you", display_name(&message.author))
    };

    let body = build_notification_body(message);
    let url = if let Some(guild_id) = &message.guild_id {
        format!("/channels/{guild_id}/{}/{}", message.channel_id, message.id)
    } else {
        format!("/channels/@me/{}/{}", message.channel_id, message.id)
    };

    Some(NativeNotificationPayload {
        id: format!("{}:{}", config.account.user_id, message.id),
        title,
        body,
        url,
        target_user_id: config.account.user_id.clone(),
    })
}

#[cfg(target_os = "android")]
fn build_notification_body(message: &GatewayMessageCreate) -> String {
    let content = message.content.trim();
    if !content.is_empty() {
        return ellipsize(content.replace('\n', " "), 180);
    }

    if let Some(attachment) = message.attachments.first() {
        return format!("Attachment: {}", attachment.filename);
    }

    if let Some(embed) = message.embeds.first() {
        if let Some(description) = &embed.description {
            if let Some(title) = &embed.title {
                return ellipsize(format!("{title}: {description}"), 180);
            }
            return ellipsize(description.clone(), 180);
        }

        if let Some(title) = &embed.title {
            return ellipsize(title.clone(), 180);
        }

        if let Some(field) = embed.fields.first() {
            return ellipsize(format!("{}: {}", field.name, field.value), 180);
        }
    }

    "Sent a message".to_owned()
}

#[cfg(target_os = "android")]
fn display_name(user: &GatewayUser) -> String {
    user.global_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| user.username.clone())
}

#[cfg(target_os = "android")]
fn ellipsize(value: String, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value;
    }

    let truncated: String = value.chars().take(max_len.saturating_sub(1)).collect();
    format!("{truncated}…")
}
