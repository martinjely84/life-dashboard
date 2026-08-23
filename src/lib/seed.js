// Starter content for an EMPTY database.
//
// This runs once, only when the domains table has no rows. Once the app is
// pointed at a Supabase project with data in it, nothing here is ever read
// again — the real content lives in the database, not in this file.
//
// Deliberately generic: this file is in version control, so it holds no
// personal detail. Edit your actual goals in the app, not here.

export const SCORE_LABELS = ['', 'Critical', 'Very low', 'Low', 'Below avg', 'Average',
  'Above avg', 'Good', 'Very good', 'Excellent', 'Thriving']

// A goal sits at the top of a folder. Everything else hangs beneath a goal.
export const ITEM_TYPES = {
  goal:     { label: 'Goal',        short: 'GOAL', color: '#c8a96e' },
  action:   { label: 'Action',      short: 'ACT',  color: '#4ecdc4' },
  task:     { label: 'Task',        short: 'TASK', color: '#6ba3ff' },
  research: { label: 'To Research', short: 'RSCH', color: '#f09ab5' },
}

// The types that live under a goal, in the order they appear in pickers.
export const CHILD_TYPES = ['action', 'task', 'research']

export const PEOPLE = [
  { id: 'me',       name: 'Me',       role: 'You',     emoji: '\u{1F464}', color: '#c8a96e', rel: '', parent_person_id: null, sort_order: 0 },
  { id: 'person-2', name: 'Person 2', role: 'Family',  emoji: '\u{1F464}', color: '#b088f9', rel: '', parent_person_id: 'me', sort_order: 1 },
  { id: 'person-3', name: 'Person 3', role: 'Family',  emoji: '\u{1F464}', color: '#4ecdc4', rel: '', parent_person_id: 'me', sort_order: 2 },
]

const g = (text, actions = []) => ({ type: 'goal', text, actions })

export const DOMAINS = [
  {
    id: 'health', name: 'Health & Fitness', emoji: '\u{1F4AA}', color: '#4ecdc4', score: 5,
    folders: [
      { name: 'General', items: [g('Add your first health goal', ['Break it into actions'])] },
      { name: 'Training', items: [] },
      { name: 'Nutrition', items: [] },
    ],
  },
  {
    id: 'career', name: 'Career', emoji: '\u{1F4BC}', color: '#c8a96e', score: 5,
    folders: [
      { name: 'General', items: [g('Add your first career goal')] },
      { name: 'Current role', items: [] },
      { name: 'Next move', items: [] },
    ],
  },
  {
    id: 'money', name: 'Money & Finance', emoji: '\u{1F4C8}', color: '#7ec887', score: 5,
    folders: [
      { name: 'General', items: [g('Add your first money goal')] },
      { name: 'Saving', items: [] },
      { name: 'Investing', items: [] },
    ],
  },
  {
    id: 'family', name: 'Family', emoji: '\u{1F46A}', color: '#b088f9', score: 5,
    folders: [
      { name: 'General', items: [g('Add your first family goal')] },
    ],
  },
  {
    id: 'growth', name: 'Personal Growth', emoji: '\u{1F9E0}', color: '#f09ab5', score: 5,
    folders: [
      { name: 'General', items: [g('Add something you want to learn')] },
    ],
  },
  {
    id: 'fun', name: 'Fun & Recreation', emoji: '\u{1F525}', color: '#ff6b6b', score: 5,
    folders: [
      { name: 'General', items: [g('Add something you enjoy doing')] },
    ],
  },
  {
    id: 'home', name: 'Physical Environment', emoji: '\u{1F3E1}', color: '#6ba3ff', score: 5,
    folders: [
      { name: 'General', items: [g('Add a home or environment goal')] },
    ],
  },
  {
    id: 'purpose', name: 'Purpose & Legacy', emoji: '\u{1F331}', color: '#e8a87c', score: 5,
    folders: [
      { name: 'General', items: [g('Add something that matters long term')] },
    ],
  },
]

export const PERSON_GOALS = {}

