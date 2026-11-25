-- SPEC 07: CAÍDA pasa a ser jugable (motor lib/engines/tetris.ts) y acepta puntajes.
update public.games
set playable = true
where id = 'caida';
