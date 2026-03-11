# Gym Workout Tracker

A simple, mobile-friendly web app for tracking gym exercises and workouts. Uses Firebase Firestore for persistent data storage and is designed for GitHub Pages hosting.

## Features

- **Add Exercise**: Add exercises under predefined muscle groups (Back, Biceps, Legs, Shoulders, Abs, Chest, Triceps)
- **Track Workout**: Log workouts with 3 sets per exercise (weight + reps), with a date selector for logging past workouts
- **Sign-in**: Google sign-in required
- **Persistent storage**: All data stored in Firebase Firestore (per-user)
- **Mobile-friendly**: Responsive design for all screen sizes

## Setup

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Add a **Web app** (</> icon)
4. Copy the `firebaseConfig` object
5. Edit `js/firebase-config.js` and replace the placeholder values with your config

### 2. Enable Sign-in Methods

In Firebase Console → **Authentication** → **Sign-in method**:

- Enable **Google** (add support email if prompted)

### 3. Firestore Security Rules

In Firebase Console → Firestore Database → **Rules**, paste the contents of `firestore.rules`. The rules require authentication and ensure users can only access their own data.

### 4. Firestore Indexes

The app uses composite indexes for Firestore queries. Deploy them via Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

This deploys:

- **exercises**: `user_id` + `muscle_group` (for loading exercises by muscle group)
- **workout_logs**: `user_id` + `exercise` + `date` (for PR and workout history charts)

Or: when you first load a page, Firestore may show an error with a link to create the required index in the console.

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
│   ├── auth.js             # Google & Anonymous sign-in
│   ├── nav-auth.js         # Auth UI in nav
│   ├── day-defaults.js    # Day-based muscle group defaults
│   ├── add-exercise.js    # Add exercise logic
│   └── workout.js         # Workout tracking logic
└── README.md
```

## Firestore Data Structure

### exercises
```json
{
  "user_id": "firebase-uid",
  "muscle_group": "Back",
  "exercise_name": "Lat Pulldown"
}
```

### workout_logs
```json
{
  "user_id": "firebase-uid",
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
