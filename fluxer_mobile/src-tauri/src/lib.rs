mod mobile_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(mobile_bridge::init())
        .invoke_handler(tauri::generate_handler![
            mobile_bridge::mobile_check_permissions,
            mobile_bridge::mobile_request_permissions,
            mobile_bridge::mobile_open_permission_settings,
            mobile_bridge::mobile_sync_push_state,
            mobile_bridge::mobile_consume_notification_clicks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
