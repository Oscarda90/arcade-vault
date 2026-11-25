-- SPEC 08: BLOQUE BUSTER pasa a ser jugable (motor lib/engines/breakout.ts) y acepta puntajes.
update public.games
set playable = true
where id = 'bloque-buster';
