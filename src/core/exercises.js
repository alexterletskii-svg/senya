'use strict';

// Микро-разминки. anim — какую анимацию показывает Сеня (классы ex-* в style.css).
const EXERCISES = [
  { id: 'neck-tilt', title: 'Наклоны головы', anim: 'tilt', seconds: 30, steps: 'Медленно наклоняй голову к плечу: влево, потом вправо. Плечи опущены, дыши ровно.' },
  { id: 'neck-turn', title: 'Повороты головы', anim: 'turn', seconds: 30, steps: 'Поворачивай голову влево и вправо, взгляд за плечо. Без рывков.' },
  { id: 'shoulders', title: 'Круги плечами', anim: 'shoulders', seconds: 30, steps: 'Большие круги плечами назад, потом вперёд. Руки свободно.' },
  { id: 'wrists', title: 'Запястья', anim: 'wrists', seconds: 30, steps: 'Вращай кистями в обе стороны, потом сожми и разожми кулаки.' },
  { id: 'stretch', title: 'Потягушки', anim: 'stretch', seconds: 30, steps: 'Встань, руки вверх, потянись макушкой к потолку. На выдохе опусти.' },
  { id: 'breath', title: 'Дыхание 4-6', anim: 'breath', seconds: 40, steps: 'Вдох носом на 4 счёта, выдох ртом на 6. Плечи расслаблены.' },
  { id: 'palming', title: 'Ладони на глаза', anim: 'palming', seconds: 30, steps: 'Потри ладони и прикрой ими закрытые глаза. Не дави, смотри в темноту.' },
  { id: 'twist', title: 'Скрутка сидя', anim: 'twist', seconds: 30, steps: 'Сидя, поверни корпус вправо, держась за спинку. Потом влево.' },
  { id: 'walk', title: 'Пройдись', anim: 'walk', seconds: 60, steps: 'Встань и пройдись до окна или на кухню. Телефон оставь на столе.' },
];

function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || null;
}

// Случайное упражнение, не такое же, как прошлое. Если задан id — именно оно.
function pickExercise(id, lastId, rng = Math.random) {
  const wanted = id && getExercise(id);
  if (wanted) return wanted;
  const pool = EXERCISES.filter((e) => e.id !== lastId);
  return pool[Math.floor(rng() * pool.length)] || EXERCISES[0];
}

module.exports = { EXERCISES, getExercise, pickExercise };
