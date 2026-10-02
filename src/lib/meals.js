// Weekly meal plan — the ONE place to edit each week.
//
// Change `week`, the seven `dinners`, `safeFoods` and `grocery`, commit, and
// the Meal Planner tab updates. Changing `week` also resets the grocery
// checkboxes, because ticks are saved per week (in this browser's
// localStorage, not in the database).
//
// Each dinner has:
//   main   — the headline for the night
//   elsie  — Elsie's plain version (omit and set `everyone` for a shared meal)
//   family — the adults/family version
//   everyone — use instead of elsie/family when one meal suits the whole table

export const MEAL_PLAN = {
  week: '2026-W40',
  household: 'Family of 4',

  dinners: [
    { day: 'Mon', main: 'Steak and broccoli',
      elsie: 'Plain steak + broccoli', family: 'Garlic butter steak, baked potato' },
    { day: 'Tue', main: 'Burgers',
      elsie: 'Plain burger', family: 'Cheese, bacon and fixings' },
    { day: 'Wed', main: 'Chicken nuggets',
      elsie: 'Nuggets + broccoli', family: 'Nuggets on salad with ranch' },
    { day: 'Thu', main: 'Steak strips',
      elsie: 'Plain steak strips + broccoli', family: 'Teriyaki steak stir-fry with rice' },
    { day: 'Fri', main: 'Sliders',
      elsie: 'Plain sliders', family: 'Sliders with sweet potato fries' },
    { day: 'Sat', main: 'Nuggets',
      elsie: 'Plain nuggets', family: 'Buffalo chicken wraps' },
    { day: 'Sun', main: 'Grilled steak night',
      everyone: 'Grilled steak, broccoli and potatoes' },
  ],

  safeFoods: ['Chicken nuggets', 'Burgers', 'Steak', 'Broccoli'],

  // Grouped by aisle. Each item needs a name; `note` is optional.
  grocery: [
    { category: 'Meat', items: [
      { name: 'Steak', note: '~4 lb, ribeye or sirloin' },
      { name: 'Ground beef', note: '3 lb' },
      { name: 'Bacon' },
    ] },
    { category: 'Frozen', items: [
      { name: 'Chicken nuggets', note: "2 large bags, Elsie's usual brand" },
      { name: 'Sweet potato fries', note: '1 bag' },
    ] },
    { category: 'Produce', items: [
      { name: 'Broccoli', note: '4 crowns or 3 frozen bags' },
      { name: 'Potatoes', note: '5 lb bag' },
      { name: 'Salad mix' },
      { name: 'Lettuce, tomato, onion' },
      { name: 'Garlic' },
    ] },
    { category: 'Bakery', items: [
      { name: 'Burger buns', note: '8' },
      { name: 'Slider buns', note: '8' },
      { name: 'Tortillas' },
    ] },
    { category: 'Dairy', items: [
      { name: 'Cheese slices' },
      { name: 'Butter' },
    ] },
    { category: 'Pantry & sauces', items: [
      { name: 'Rice' },
      { name: 'Teriyaki sauce' },
      { name: 'Ranch' },
      { name: 'Buffalo sauce' },
    ] },
  ],
}
