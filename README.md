# Secure Code Classroom

A secure code-sharing platform for teachers: one administrator uploads and
organizes programming code by subject and folder; registered students log in
to browse and read it through a protected, syntax-highlighted viewer.

Built with **HTML5, CSS3, Bootstrap 5, and vanilla JavaScript** on the
frontend, and **Supabase** (Auth + Postgres + RLS) on the backend. No
framework or bundler is required — it deploys to **Netlify** as a static
site with a one-line build step that injects your Supabase credentials from
environment variables.

---

## 1. Features

**Administrator (single account)**
- Log in, create/edit/delete Subjects, Folders, and Code Files
- Code editor with syntax highlighting and language selection
  (C, C++, Python, Java, JavaScript, HTML, CSS, PHP, SQL, Linux/Shell)
- Search and filter code by language, subject, or keyword
- View a read-only list of registered students
- Change the admin password from Settings

**Student**
- Self-register with email + password
- Browse Subjects → Folders → Code Files
- Search by language, subject, practical name, or keyword
- Read code in a dark, line-numbered, mobile-responsive viewer
- Cannot create, edit, or delete anything (enforced by database policies,
  not just hidden buttons)

**Viewer protection (deterrents, not guarantees — see §6)**
- Text selection disabled
- Right-click / context menu blocked
- `Ctrl/Cmd + C/A/X/U/S/P` blocked
- Copy, cut, drag, and drop events blocked
- Short toast notification on any blocked attempt
- Code is rendered as individual line elements with per-token highlighting,
  not as one plain selectable text block

---

## 2. Project structure

```
secure-code-classroom/
├── index.html                 # Login (admin + student)
├── register.html               # Student self-registration
├── dashboard-admin.html        # Admin SPA shell + modals
├── dashboard-student.html      # Student SPA shell
├── assets/
│   ├── css/main.css            # Design system + components
│   └── js/
│       ├── config.sample.js    # Copy to config.js for local dev
│       ├── config.js           # AUTO-GENERATED at build time (gitignored)
│       ├── supabaseClient.js   # Creates the shared Supabase client
│       ├── utils.js            # Shared helpers (toasts, formatting, langs)
│       ├── auth.js             # Login / register / route guards
│       ├── viewer.js           # Protected code viewer + tokenizer
│       ├── admin.js            # Admin dashboard controller
│       └── student.js          # Student dashboard controller
├── sql/schema.sql              # Tables, RLS policies, triggers
├── build.js                    # Injects env vars into config.js at build time
├── netlify.toml                # Netlify build + headers config
└── package.json
```

---

## 3. Supabase setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `sql/schema.sql`, and run it.
   This creates the `profiles`, `subjects`, `folders`, and `code_files`
   tables, enables Row Level Security, and adds a trigger that auto-creates
   a `profiles` row (defaulting to role `student`) whenever someone signs up.
3. **Create the single administrator account:**
   - Go to **Authentication → Users → Add user**, enter an email and
     password, and create it.
   - Copy the new user's UUID.
   - Back in the SQL Editor, run:
     ```sql
     update public.profiles set role = 'admin' where id = 'PASTE-UUID-HERE';
     ```
   - That account can now sign in at `index.html` and lands on the admin
     dashboard. All other sign-ups via `register.html` remain students.
4. (Optional but recommended for a classroom demo) In **Authentication →
   Providers → Email**, you can disable "Confirm email" so students can sign
   in immediately after registering.
5. Copy your **Project URL** and **anon public key** from
   **Project Settings → API** — you'll need them in the next step.

---

## 4. Environment variables (no hard-coded credentials)

The app never hard-codes Supabase credentials. `assets/js/config.js` is
generated automatically:

- **On Netlify:** `build.js` runs during the build and writes
  `assets/js/config.js` from the `SUPABASE_URL` and `SUPABASE_ANON_KEY`
  environment variables you set in **Site configuration → Environment
  variables**.
- **Locally:** copy `assets/js/config.sample.js` to `assets/js/config.js`
  and fill in your own project URL/key. This file is gitignored.

The anon key is meant to be public (Supabase's design) — actual protection
comes from the Row Level Security policies in `sql/schema.sql`, which is why
those policies matter as much as the frontend code.

---

## 5. Deploying to Netlify

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project**, select the repo.
3. Build settings are already defined in `netlify.toml`:
   - Build command: `node build.js`
   - Publish directory: `.`
4. Add environment variables under **Site configuration → Environment
   variables**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Deploy. Netlify will run `build.js`, generate `assets/js/config.js`, and
   publish the site.

### Local preview without Netlify
Any static file server works, e.g.:
```bash
cp assets/js/config.sample.js assets/js/config.js   # then fill in your keys
npx serve .
```

---

## 6. Honest note on code protection

The viewer disables selection, right-click, common copy shortcuts, and
copy/cut/drag events, and renders code line-by-line rather than as a single
selectable block. These measures **discourage casual copying** but do not —
and cannot — make copying impossible: anyone can still read the screen,
take a screenshot, use browser developer tools, or transcribe code by hand.
Treat this as a UX deterrent aligned with classroom norms, not a security
guarantee, and pair it with clear academic-integrity expectations.

---

## 7. Database schema summary

| Table        | Purpose                                            |
|--------------|-----------------------------------------------------|
| `profiles`   | One row per auth user; holds `role` (`admin`/`student`) |
| `subjects`   | Top-level groupings (e.g. "Data Structures")        |
| `folders`    | Belong to a subject (e.g. "Practical 1")            |
| `code_files` | The saved code: title, language, description, code, subject_id, folder_id, created_at, updated_at |

All writes to `subjects`, `folders`, and `code_files` are restricted to the
`admin` role at the database level via Row Level Security — this holds even
if someone bypasses the UI and calls the Supabase API directly.
