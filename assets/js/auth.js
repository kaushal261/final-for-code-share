/**
 * auth.js
 * ---------------------------------------------------------------------------
 * Handles login, student registration, role-based redirects, and route
 * guards for the two dashboards. Relies on window.sbClient (supabaseClient.js).
 * ---------------------------------------------------------------------------
 */

/** Fetch the profile row (id, full_name, email, role) for the current session user. */
async function fetchCurrentProfile() {
  const { data: { user }, error: userErr } = await window.sbClient.auth.getUser();
  if (userErr || !user) return null;

  const { data, error } = await window.sbClient
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('fetchCurrentProfile error:', error);
    return null;
  }
  return data;
}

/** Redirect a logged-in user to the dashboard matching their role. */
function redirectForRole(role) {
  if (role === 'admin') {
    window.location.href = 'dashboard-admin.html';
  } else {
    window.location.href = 'dashboard-student.html';
  }
}

/** Used on index.html: if a session already exists, skip straight to the dashboard. */
async function redirectIfAlreadyLoggedIn() {
  const { data: { session } } = await window.sbClient.auth.getSession();
  if (!session) return;
  const profile = await fetchCurrentProfile();
  if (profile) redirectForRole(profile.role);
}

/**
 * Route guard for dashboard pages. Call at the top of admin.js / student.js.
 * Redirects to index.html if not logged in, or to the correct dashboard if
 * the logged-in user's role doesn't match the page they landed on.
 * Returns the profile object on success.
 */
async function guardRoute(requiredRole) {
  const { data: { session } } = await window.sbClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  const profile = await fetchCurrentProfile();
  if (!profile) {
    await window.sbClient.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }
  if (profile.role !== requiredRole) {
    redirectForRole(profile.role);
    return null;
  }
  return profile;
}

/** Handle the login form submit. */
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const alertBox = document.getElementById('loginAlert');
  const btn = document.getElementById('loginBtn');

  alertBox.classList.remove('show', 'error', 'success');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in…';

  try {
    const { error } = await window.sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchCurrentProfile();
    if (!profile) throw new Error('Your account exists but no profile was found. Contact the administrator.');

    redirectForRole(profile.role);
  } catch (err) {
    alertBox.textContent = friendlyError(err);
    alertBox.classList.add('show', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Sign in';
  }
}

/** Handle the student registration form submit. */
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const fullName = document.getElementById('regFullName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirmPassword').value;
  const alertBox = document.getElementById('registerAlert');
  const btn = document.getElementById('registerBtn');

  alertBox.classList.remove('show', 'error', 'success');

  if (password !== confirm) {
    alertBox.textContent = 'Passwords do not match.';
    alertBox.classList.add('show', 'error');
    return;
  }
  if (password.length < 6) {
    alertBox.textContent = 'Password must be at least 6 characters.';
    alertBox.classList.add('show', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account…';

  try {
    // New accounts always register as students (role defaults to 'student'
    // via the handle_new_user() trigger + DB check constraint — see schema.sql).
    const { data, error } = await window.sbClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;

    if (data.session) {
      // Email confirmation is disabled on the project — user is signed in immediately.
      redirectForRole('student');
      return;
    }

    alertBox.textContent = 'Account created! Check your email to confirm your address, then sign in.';
    alertBox.classList.add('show', 'success');
    btn.innerHTML = 'Account created';
    setTimeout(() => { window.location.href = 'index.html'; }, 2200);
  } catch (err) {
    alertBox.textContent = friendlyError(err);
    alertBox.classList.add('show', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create account';
  }
}

/** Attach to any "Logout" button/link on dashboard pages. */
function bindLogoutButtons() {
  document.querySelectorAll('[data-action="logout"]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await window.sbClient.auth.signOut();
      window.location.href = 'index.html';
    });
  });
}
