begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- u1 crée une partie privée (défaut), u2 une publique
select test_login('00000000-0000-0000-0000-000000000001');
create temp table priv as select (create_game('Host1')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
create temp table pub as select
  (create_game('Host2', p_visibility => 'public')->>'game_id')::uuid as gid;

select is((select visibility from games where id = (select gid from priv)), 'private', 'défaut privé');
select is((select visibility from games where id = (select gid from pub)), 'public', 'publique à la demande');

-- RLS : u3 (étranger) ne voit que la partie publique en lobby
select test_login('00000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select count(*)::int from games), 1, 'l''étranger ne voit que la publique');
reset role;

-- board
select test_login('00000000-0000-0000-0000-000000000003');
create temp table board as select list_public_games() as j;
select is((select json_array_length(j) from board), 1, 'board : 1 partie');
select is((select j->0->>'host_nickname' from board), 'Host2', 'board : pseudo de l''hôte');
select is((select (j->0->>'player_count')::int from board), 1, 'board : 1 joueur');

-- rejoindre la publique par id
select lives_ok(format($$select join_game_by_id(%L, 'Intrus')$$, (select gid from pub)), 'join publique par id');
select is((select count(*)::int from players where game_id = (select gid from pub)), 2, 'publique pleine');
select is((select json_array_length(list_public_games())), 0, 'board vide une fois pleine');

-- la privée reste injoignable par id
select throws_ok(format($$select join_game_by_id(%L, 'Intrus')$$, (select gid from priv)),
  'P0001', 'GAME_NOT_FOUND', 'privée introuvable par id');

-- réglages : NOT_HOST pour un non-joueur, OK pour l'hôte, resync bankroll, bornes
select throws_ok(format($$select update_game_settings(%L, p_start_bankroll => 2000)$$, (select gid from priv)),
  'P0001', 'NOT_HOST', 'étranger ne règle rien');
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select update_game_settings(%L, p_start_bankroll => 2000, p_close_delay_seconds => 10)$$, (select gid from priv)),
  'l''hôte règle en lobby privé');
select is((select start_bankroll from games where id = (select gid from priv)), 2000, 'bankroll réglée');
select is((select min(bankroll)::int from players where game_id = (select gid from priv)), 2000, 'bankrolls joueurs resynchronisées');
select throws_ok(format($$select update_game_settings(%L, p_min_bid => 0)$$, (select gid from priv)),
  'P0001', 'INVALID_SETTINGS', 'bornes refusées');

-- publique : réglages verrouillés ; puis démarrée : plus de réglages du tout
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select update_game_settings(%L, p_min_bid => 20)$$, (select gid from pub)),
  'P0001', 'SETTINGS_LOCKED', 'publique verrouillée');
select start_game((select gid from pub));
select throws_ok(format($$select update_game_settings(%L, p_min_bid => 20)$$, (select gid from pub)),
  'P0001', 'GAME_NOT_IN_LOBBY', 'pas de réglage hors lobby');

-- revanche : refusée tant que non finie (u1 est joueur de la privée, encore en lobby)
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select rematch_game(%L)$$, (select gid from priv)),
  'P0001', 'GAME_NOT_FINISHED', 'pas de revanche en lobby');

-- puis idempotente, privée, proposeur hôte (u2 propose sur la publique finie)
select test_login('00000000-0000-0000-0000-000000000002');
update games set status = 'finished' where id = (select gid from pub);
create temp table rem as select
  (rematch_game((select gid from pub))->>'game_id')::uuid as gid;
select is((select next_game_id from games where id = (select gid from pub)), (select gid from rem), 'pointeur next_game_id posé');
select is((select visibility from games where id = (select gid from rem)), 'private', 'revanche privée');
select is((select seat from players where game_id = (select gid from rem)
           and auth_uid = '00000000-0000-0000-0000-000000000002'), 0, 'proposeur hôte de la revanche');

select test_login('00000000-0000-0000-0000-000000000003');
select is((rematch_game((select gid from pub))->>'game_id')::uuid, (select gid from rem), 'idempotente : même revanche');
select lives_ok(format($$select join_game_by_id(%L, 'Intrus')$$, (select gid from rem)), 'backlink : l''autre joueur rejoint');
select is((select count(*)::int from players where game_id = (select gid from rem)), 2, 'revanche à 2');

select test_login('00000000-0000-0000-0000-000000000004');
select throws_ok(format($$select rematch_game(%L)$$, (select gid from pub)),
  'P0001', 'NOT_A_PLAYER', 'étranger sans revanche');

select * from finish();
rollback;
