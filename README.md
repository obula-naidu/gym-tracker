# Gym Workout Tracker

A simple, mobile-friendly web app for tracking gym exercises and workouts. Uses Firebase Firestore for persistent data storage and is designed for GitHub Pages hosting.

## Features

- **Add Exercise**: Add exercises under predefined muscle groups (Back, Biceps, Legs, Shoulders, Abs, Chest, Triceps)
- **Track Workout**: Log workouts with 3 sets per exercise (weight + reps)
- **Persistent storage**: All data stored in Firebase Firestore
- **Mobile-friendly**: Responsive design for all screen sizes

## Setup

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Add a **Web app** (</> icon)
4. Copy the `firebaseConfig` object
5. Edit `js/firebase-config.js` and replace the placeholder values with your config

### 2. Firestore Security Rules

In Firebase Console → Firestore Database → Rules, add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /exercises/{document=**} {
      allow read, write: if true;  // For demo; tighten for production
    }
    match /workout_logs/{document=**} {
      allow read, write: if true;  // For demo; tighten for production
    }
  }
}
```

> **Note**: For production, add authentication and restrict access. These rules allow anyone to read/write.

### 3. Firestore Indexes (optional)

For querying exercises by muscle group, Firestore may prompt you to create an index when first used. Follow the link in the error message to create it, or create manually:

- **Collection**: `exercises`
- **Fields**: `muscle_group` (Ascending)

## GitHub Pages Deployment

1. Push this project to a GitHub repository
2. Go to **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose your branch (e.g. `main`) and folder **/ (root)**
5. Click **Save**

Your site will be live at `https://<username>.github.io/<repo-name>/`

## Project Structure

```
obul_g/
├── index.html          # Home / landing page
├── add-exercise.html   # Add exercises by muscle group
├── workout.html        # Track workout (sets, weight, reps)
├── css/
│   └── styles.css      # Shared styles
├── js/
│   ├── firebase-config.js  # Firebase credentials (edit this!)
│   ├── add-exercise.js    # Add exercise logic
│   └── workout.js         # Workout tracking logic
└── README.md
```

## Firestore Data Structure

### exercises
```json
{
  "muscle_group": "Back",
  "exercise_name": "Lat Pulldown"
}
```

### workout_logs
```json
{
  "date": "2026-03-09",
  "muscle_group": "Back",
  "exercise": "Lat Pulldown",
  "set": 1,
  "weight": 40,
  "reps": 12
}
```

## Local Development

Open `index.html` in a browser, or use a simple HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js (npx)
npx serve .
```

Then visit `http://localhost:8000`
