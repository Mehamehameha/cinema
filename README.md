# Cinema Circle

A small local web app for coordinating cinema plans with friends.

Open `index.html` in a browser. The app stores data in browser local storage by default.

For shared group data, create the Supabase table in `supabase-schema.sql`, then paste your Supabase project URL and anon key into `app-config.js`.

For real dated Dendy session lookup, deploy with Netlify so `netlify/functions/dendy-sessions.js` can proxy Dendy's API.

## What it does

- Tracks films and when they leave the cinema.
- Tracks showtimes for the selected cinema week, running Thursday to Wednesday.
- Imports the current public showtimes from Dendy Newtown.
- Checks dated Dendy sessions through a Netlify serverless function.
- Tracks friend availability by day and time block.
- Tracks each friend's preference for each film: want, maybe, seen, or skip.
- Ranks the best sessions by who can attend and who wants to see the film.

## Files

- `index.html` - app structure
- `styles.css` - layout and visual design
- `app.js` - state, scoring, and interactions
- `app-config.js` - Supabase project configuration
- `supabase-schema.sql` - shared weekly-state table and policies
