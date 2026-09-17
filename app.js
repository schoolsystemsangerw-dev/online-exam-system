import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://xowfbzcbeiwuffvlwhmn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h7p-pbw5WiGhvk-aKSyj5A_yMYB35yb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Tab Switch Logic
document.getElementById('tab-login')?.addEventListener('click', () => {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('tab-login').className = "w-1/2 py-2 text-center font-bold border-b-2 border-blue-600 text-blue-600";
    document.getElementById('tab-signup').className = "w-1/2 py-2 text-center font-bold text-gray-500 border-b-2 border-transparent";
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('tab-signup').className = "w-1/2 py-2 text-center font-bold border-b-2 border-blue-600 text-blue-600";
    document.getElementById('tab-login').className = "w-1/2 py-2 text-center font-bold text-gray-500 border-b-2 border-transparent";
});

// Initialize Session Check
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        handleUserLogin(session.user);
    }
});

// Register New Teacher or Student
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;

    // 1. Sign up user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName, role: role }
        }
    });

    if (authError) return alert("Registration Error: " + authError.message);

    if (authData.user) {
        // 2. Add Profile Record
        const { error: profileError } = await supabase.from('profiles').insert([{
            id: authData.user.id,
            full_name: fullName,
            role: role
        }]);

        if (profileError) {
            alert("Profile Creation Error: " + profileError.message);
        } else {
            alert("Account created successfully! Logging you in...");
            handleUserLogin(authData.user);
        }
    }
});

// Login Handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Login failed: " + error.message);
    } else {
        handleUserLogin(data.user);
    }
});

// Logout Handler
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
});

async function handleUserLogin(user) {
    currentUser = user;
    
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        alert("Profile fetch error: " + error.message);
        return;
    }

    document.getElementById('auth-status').innerText = `${profile.full_name} (${profile.role.toUpperCase()})`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-section').classList.add('hidden');

    if (profile.role === 'teacher') {
        document.getElementById('teacher-dashboard').classList.remove('hidden');
    } else {
        document.getElementById('student-dashboard').classList.remove('hidden');
    }
}
