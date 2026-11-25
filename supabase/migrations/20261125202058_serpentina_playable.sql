-- SPEC 09: SERPENTINA pasa a ser jugable (motor lib/engines/snake.ts) y acepta puntajes.
-- `long` se ajusta a las frutas de neón; título, short, cover, color y orden sin cambios.
update public.games
set playable = true,
    long = 'Una serpiente de luz recorre la grilla buscando frutas de neón. Cada bocado la alarga y la hace más veloz. Un choque contra el muro o un movimiento en falso y se devora a sí misma.'
where id = 'serpentina';
