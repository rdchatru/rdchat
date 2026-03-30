%% Copyright (C) 2026 Fluxer Contributors
%%
%% This file is part of Fluxer.
%%
%% Fluxer is free software: you can redistribute it and/or modify
%% it under the terms of the GNU Affero General Public License as published by
%% the Free Software Foundation, either version 3 of the License, or
%% (at your option) any later version.
%%
%% Fluxer is distributed in the hope that it will be useful,
%% but WITHOUT ANY WARRANTY; without even the implied warranty of
%% MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
%% GNU Affero General Public License for more details.
%%
%% You should have received a copy of the GNU Affero General Public License
%% along with Fluxer. If not, see <https://www.gnu.org/licenses/>.

-module(guild_voice_member).

-export([update_member_voice/2]).
-export([find_member_by_user_id/2]).
-export([find_or_load_member_by_user_id/2]).
-export([find_channel_by_id/2]).

-type guild_state() :: map().
-type guild_reply(T) :: {reply, T, guild_state()}.
-type member() :: map().
-type voice_state() :: map().
-type request() :: #{
    user_id := integer(),
    mute := boolean(),
    deaf := boolean()
}.

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").
-endif.

-spec update_member_voice(request(), guild_state()) -> guild_reply(map()).
update_member_voice(Request, State) ->
    #{user_id := UserId, mute := Mute, deaf := Deaf} = Request,
    VoiceStates = voice_state_utils:voice_states(State),
    GuildId = map_utils:get_integer(State, id, 0),
    case find_or_load_member_by_user_id(UserId, State) of
        {undefined, State1} ->
            {reply, gateway_errors:error(voice_member_not_found), State1};
        {Member, State1} ->
            UpdatedMember = set_member_voice_flags(Member, Mute, Deaf),
            StateWithUpdatedMember = store_member(UpdatedMember, State1),
            UserVoiceStates = user_voice_states(UserId, VoiceStates),
            case maps:size(UserVoiceStates) of
                0 ->
                    {reply, #{success => true}, StateWithUpdatedMember};
                _ ->
                    maybe_enforce_voice_states(
                        GuildId, UserId, Mute, Deaf, UserVoiceStates, State
                    ),
                    {NewVoiceStates, UpdatedStates} =
                        update_voice_states(UserVoiceStates, VoiceStates, Mute, Deaf),
                    FinalState = maps:put(voice_states, NewVoiceStates, StateWithUpdatedMember),
                    broadcast_voice_state_updates(UpdatedStates, FinalState),
                    {reply, #{success => true}, FinalState}
            end
    end.

-spec find_member_by_user_id(integer(), guild_state()) -> member() | undefined.
find_member_by_user_id(UserId, State) ->
    guild_permissions:find_member_by_user_id(UserId, State).

-spec find_or_load_member_by_user_id(integer(), guild_state()) -> {member() | undefined, guild_state()}.
find_or_load_member_by_user_id(UserId, State) ->
    case find_member_by_user_id(UserId, State) of
        Member when is_map(Member) ->
            {Member, State};
        undefined ->
            maybe_load_member_by_user_id(UserId, State)
    end.

-spec maybe_load_member_by_user_id(integer(), guild_state()) -> {member() | undefined, guild_state()}.
maybe_load_member_by_user_id(UserId, State) ->
    case maps:get(voice_member_lookup_pid, State, undefined) of
        LookupPid when is_pid(LookupPid) ->
            case fetch_member_from_lookup_pid(UserId, LookupPid) of
                Member when is_map(Member) ->
                    logger:debug(
                        "Loaded missing guild member for voice handling",
                        #{user_id => UserId}
                    ),
                    {Member, store_member(Member, State)};
                undefined ->
                    {undefined, State}
            end;
        _ ->
            {undefined, State}
    end.

-spec fetch_member_from_lookup_pid(integer(), pid()) -> member() | undefined.
fetch_member_from_lookup_pid(UserId, LookupPid) ->
    try gen_server:call(LookupPid, {get_guild_member, #{user_id => UserId}}, 5000) of
        #{success := true, member_data := Member} when is_map(Member) ->
            Member;
        _ ->
            undefined
    catch
        exit:{timeout, _} ->
            undefined;
        exit:{noproc, _} ->
            undefined;
        exit:{normal, _} ->
            undefined
    end.

-spec find_channel_by_id(integer(), guild_state()) -> map() | undefined.
find_channel_by_id(ChannelId, State) ->
    guild_permissions:find_channel_by_id(ChannelId, State).

-spec enforce_participant_state_in_livekit(integer(), integer(), integer(), boolean(), boolean()) ->
    ok.
enforce_participant_state_in_livekit(GuildId, ChannelId, UserId, Mute, Deaf) ->
    Req = voice_utils:build_update_participant_rpc_request(GuildId, ChannelId, UserId, Mute, Deaf),
    case rpc_client:call(Req) of
        {ok, _Data} ->
            ok;
        {error, _Reason} ->
            ok
    end.

-spec guild_data(guild_state()) -> map().
guild_data(State) ->
    map_utils:ensure_map(map_utils:get_safe(State, data, #{})).

-spec member_user_id(member()) -> integer() | undefined.
member_user_id(Member) when is_map(Member) ->
    User = map_utils:ensure_map(maps:get(<<"user">>, Member, #{})),
    map_utils:get_integer(User, <<"id">>, undefined).

-spec set_member_voice_flags(member(), boolean(), boolean()) -> member().
set_member_voice_flags(Member, Mute, Deaf) ->
    Member#{<<"mute">> => Mute, <<"deaf">> => Deaf}.

-spec store_member(member(), guild_state()) -> guild_state().
store_member(Member, State) ->
    case member_user_id(Member) of
        undefined ->
            State;
        _TargetId ->
            Data = guild_data(State),
            UpdatedData = guild_data_index:put_member(Member, Data),
            maps:put(data, UpdatedData, State)
    end.

-spec user_voice_states(integer(), map()) -> map().
user_voice_states(UserId, VoiceStates) when is_integer(UserId), is_map(VoiceStates) ->
    maps:filter(
        fun(_ConnId, VoiceState) ->
            voice_state_utils:voice_state_user_id(VoiceState) =:= UserId
        end,
        VoiceStates
    );
user_voice_states(_UserId, _VoiceStates) ->
    #{}.

-spec update_voice_states(map(), map(), boolean(), boolean()) -> {map(), [voice_state()]}.
update_voice_states(UserVoiceStates, VoiceStates, Mute, Deaf) ->
    maps:fold(
        fun(ConnId, VoiceState, {AccVoiceStates, AccUpdated}) ->
            UpdatedVoiceState = update_voice_state_flags(VoiceState, Mute, Deaf),
            {maps:put(ConnId, UpdatedVoiceState, AccVoiceStates), [UpdatedVoiceState | AccUpdated]}
        end,
        {VoiceStates, []},
        UserVoiceStates
    ).

-spec update_voice_state_flags(voice_state(), boolean(), boolean()) -> voice_state().
update_voice_state_flags(VoiceState, Mute, Deaf) ->
    OldVersion = maps:get(<<"version">>, VoiceState, 0),
    VoiceState#{<<"mute">> => Mute, <<"deaf">> => Deaf, <<"version">> => OldVersion + 1}.

-spec maybe_enforce_voice_states(integer(), integer(), boolean(), boolean(), map(), guild_state()) ->
    ok.
maybe_enforce_voice_states(GuildId, UserId, Mute, Deaf, VoiceStates, State) ->
    maps:foreach(
        fun(_ConnId, VoiceState) ->
            case voice_state_utils:voice_state_channel_id(VoiceState) of
                ChannelId when is_integer(ChannelId) ->
                    dispatch_livekit_enforcement(GuildId, ChannelId, UserId, Mute, Deaf, State);
                _ ->
                    ok
            end
        end,
        VoiceStates
    ).

-spec dispatch_livekit_enforcement(
    integer(), integer(), integer(), boolean(), boolean(), guild_state()
) -> ok.
dispatch_livekit_enforcement(GuildId, ChannelId, UserId, Mute, Deaf, State) ->
    case maps:get(test_livekit_fun, State, undefined) of
        Fun when is_function(Fun, 5) ->
            Fun(GuildId, ChannelId, UserId, Mute, Deaf);
        _ ->
            spawn(fun() ->
                enforce_participant_state_in_livekit(GuildId, ChannelId, UserId, Mute, Deaf)
            end)
    end.

-spec broadcast_voice_state_updates([voice_state()], guild_state()) -> ok.
broadcast_voice_state_updates([], _State) ->
    ok;
broadcast_voice_state_updates(UpdatedStates, State) ->
    lists:foreach(
        fun(UpdatedVoiceState) ->
            ChannelIdBin = maps:get(<<"channel_id">>, UpdatedVoiceState, null),
            guild_voice_broadcast:broadcast_voice_state_update(
                UpdatedVoiceState, State, ChannelIdBin
            )
        end,
        UpdatedStates
    ).

-ifdef(TEST).

update_member_voice_updates_member_flags_test() ->
    State = voice_member_test_state(#{}),
    Request = #{user_id => 10, mute => true, deaf => false},
    {reply, #{success := true}, UpdatedState} = update_member_voice(Request, State),
    Member = find_member_by_user_id(10, UpdatedState),
    ?assertEqual(true, maps:get(<<"mute">>, Member)),
    ?assertEqual(false, maps:get(<<"deaf">>, Member)).

update_member_voice_updates_voice_states_test() ->
    Self = self(),
    VoiceState = voice_state_fixture(10, 500),
    TestFun = fun(GuildId, ChannelId, UserId, Mute, Deaf) ->
        Self ! {enforced, GuildId, ChannelId, UserId, Mute, Deaf}
    end,
    State = voice_member_test_state(#{
        voice_states => #{<<"conn">> => VoiceState},
        test_livekit_fun => TestFun
    }),
    Request = #{user_id => 10, mute => true, deaf => true},
    {reply, #{success := true}, UpdatedState} = update_member_voice(Request, State),
    UpdatedVoiceStates = maps:get(voice_states, UpdatedState),
    UpdatedVoiceState = maps:get(<<"conn">>, UpdatedVoiceStates),
    ?assertEqual(true, maps:get(<<"mute">>, UpdatedVoiceState)),
    ?assertEqual(true, maps:get(<<"deaf">>, UpdatedVoiceState)),
    ?assertEqual(1, maps:get(<<"version">>, UpdatedVoiceState)),
    receive
        {enforced, 42, 500, 10, true, true} -> ok
    after 100 ->
        ?assert(false)
    end.

update_member_voice_member_not_found_test() ->
    State = voice_member_test_state(#{}),
    Request = #{user_id => 999, mute => true, deaf => false},
    {reply, Error, _} = update_member_voice(Request, State),
    ?assertEqual({error, not_found, voice_member_not_found}, Error).

find_or_load_member_by_user_id_loads_missing_member_test() ->
    LookupPid = start_member_lookup_pid(#{success => true, member_data => member_fixture(77)}),
    State = voice_member_test_state(#{
        data => #{<<"members">> => #{}},
        voice_member_lookup_pid => LookupPid
    }),
    {Member, LoadedState} = find_or_load_member_by_user_id(77, State),
    ?assertEqual(member_fixture(77), Member),
    ?assertEqual(member_fixture(77), find_member_by_user_id(77, LoadedState)),
    stop_member_lookup_pid(LookupPid).

voice_member_test_state(Overrides) ->
    BaseData = #{
        <<"members">> => #{
            10 => member_fixture(10)
        }
    },
    BaseState = #{
        id => 42,
        data => BaseData,
        voice_states => #{}
    },
    maps:merge(BaseState, Overrides).

member_fixture(UserId) ->
    #{
        <<"user">> => #{<<"id">> => integer_to_binary(UserId)},
        <<"mute">> => false,
        <<"deaf">> => false
    }.

voice_state_fixture(UserId, ChannelId) ->
    #{
        <<"user_id">> => integer_to_binary(UserId),
        <<"channel_id">> => integer_to_binary(ChannelId),
        <<"connection_id">> => <<"test-conn">>,
        <<"mute">> => false,
        <<"deaf">> => false,
        <<"version">> => 0,
        <<"member">> => member_fixture(UserId)
    }.

start_member_lookup_pid(Reply) ->
    spawn_link(fun() -> member_lookup_loop(Reply) end).

stop_member_lookup_pid(Pid) when is_pid(Pid) ->
    Pid ! stop,
    ok.

member_lookup_loop(Reply) ->
    receive
        {'$gen_call', {FromPid, Tag}, {get_guild_member, #{user_id := _UserId}}} ->
            FromPid ! {Tag, Reply},
            member_lookup_loop(Reply);
        stop ->
            ok;
        _Other ->
            member_lookup_loop(Reply)
    end.

-endif.
