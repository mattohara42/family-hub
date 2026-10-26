// ════════════════════════════════════════════════════════════════
//  🔧 CONFIGURATION: this install's Google and Firebase identity
// ════════════════════════════════════════════════════════════════
//
// These are public identifiers, not secrets: the browser has to see them to
// sign in. Access is controlled by the OAuth client's Authorized JavaScript
// Origins and by firestore.rules, not by hiding these values.
//
// Running your own copy? Don't edit this file on Netlify. Set the
// GOOGLE_CLIENT_ID and FIREBASE_CONFIG environment variables instead and
// netlify-build.js rewrites this file at deploy time, so your fork can keep
// pulling upstream changes without conflicts. Edit it directly only for
// local dev under `python3 -m http.server`. See family-hub-setup.md.

window.FH_CONFIG = {
  firebase: {
    apiKey:            "AIzaSyCq_WtqHd5WmJldlNptE8zchu2RmuAX_yE",
    authDomain:        "familyhub-5fc43.firebaseapp.com",
    projectId:         "familyhub-5fc43",
    storageBucket:     "familyhub-5fc43.firebasestorage.app",
    messagingSenderId: "941604403053",
    appId:             "1:941604403053:web:4ba83f1a451693f69b8c64"
  },
  googleClientId: "1023822683234-e0pslac1cag5ju2o26gl5c9kq36udr7q.apps.googleusercontent.com"
};
