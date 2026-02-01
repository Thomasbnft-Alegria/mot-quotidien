

## French Vocabulary PWA - "Mot du Jour"

### Overview
A minimalist PWA that delivers one rare French word daily at 12:30 PM, with spaced repetition quizzes and weekly reviews. Modern sans-serif design with local progress tracking.

---

### Screens & Features

**1. Home / Daily Word**
- Large, centered display of today's word
- Clean typography showing: word, category badge, definition, example sentence (in italics)
- "J'ai compris" button marks word as seen
- After seeing: "Réviser" button appears to launch quiz
- Elegant transition animations

**2. Quiz Mode**
- Card-based interface showing the word
- 4 definition choices (1 correct + 3 distractors from same category/register)
- 3-5 words per session, prioritized by:
  - Highest incorrect count first
  - Longest time since last review
- Immediate visual feedback (green/red) on answer
- Progress indicator showing current question number
- Updates local correctCount/incorrectCount

**3. Weekly Review (Sunday only)**
- List of all 7 words from the current week
- For each word: display word → user types their definition
- "Vérifier" reveals the correct definition
- Self-assessment buttons: "Je savais" / "Je ne savais pas"
- Summary at the end with week's performance

**4. Progress Dashboard**
- Total words learned count
- Current streak (consecutive days)
- "Mastered" words count (>3 correct, 0 recent incorrect)
- Simple visual stats (no complex charts)

---

### Navigation
- Bottom tab bar: Accueil | Quiz | Révision | Progrès
- Weekly Review tab shows lock icon until Sunday

---

### Database (Supabase)
**Table: words**
- id, word, definition, example_sentence
- category (nom/adjectif/verbe/adverbe)
- register (soutenu/courant)
- date_shown (nullable)

**Initial seed data:** 10 curated words mixing categories and registers

---

### Local Storage
- Progress data (streaks, review dates)
- Word statistics (correctCount, incorrectCount, lastReviewed)
- Which words have been seen

---

### PWA Features
- Service worker for offline access to seen words
- Push notifications:
  - 12:30 PM daily: "Votre mot du jour est arrivé"
  - Sunday 20:00: "Quiz hebdo disponible"
- Install prompt
- App manifest with French vocabulary icon

---

### Design System
- Modern sans-serif typography (Inter or similar)
- Clean white background with subtle gray accents
- French blue accent color for buttons and highlights
- Generous whitespace
- Category badges with subtle colors
- Mobile-first, responsive layout

