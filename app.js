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

    // Sign up user with user_metadata (Database trigger handles profile row creation)
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName, role: role }
        }
    });

    if (authError) {
        return alert("Registration Error: " + authError.message);
    }

    if (authData.user) {
        alert("Account created successfully! Logging you in...");
        handleUserLogin(authData.user);
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

// User Session and Dashboard Navigation
async function handleUserLogin(user) {
    currentUser = user;
    
    // Using maybeSingle() eliminates the JSON coercion error if trigger timing delays
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        alert("Profile fetch error: " + error.message);
        return;
    }

    // Safely retrieve name and role from profile or raw auth metadata
    const fullName = profile?.full_name || user.user_metadata?.full_name || 'User';
    const role = profile?.role || user.user_metadata?.role || 'teacher';

    document.getElementById('auth-status').innerText = `${fullName} (${role.toUpperCase()})`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-section').classList.add('hidden');

    if (role === 'teacher') {
        document.getElementById('teacher-dashboard').classList.remove('hidden');
    } else {
        document.getElementById('student-dashboard').classList.remove('hidden');
    }
}

// Teacher Exam Creation Handler
document.getElementById('create-exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('exam-title').value;
    const subject = document.getElementById('exam-subject').value;
    const className = document.getElementById('exam-class').value;
    const totalMarks = document.getElementById('exam-marks').value;
    const deadline = document.getElementById('exam-deadline').value;
    const file = document.getElementById('exam-file').files[0];

    const filePath = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

    // 1. Upload file to exam-papers storage bucket
    const { data: storageData, error: storageError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file);

    if (storageError) {
        return alert('Storage upload error: ' + storageError.message);
    }

    // 2. Insert metadata record into exams table
    const { error: dbError } = await supabase.from('exams').insert([{
        title,
        subject,
        class_name: className,
        total_marks: totalMarks,
        deadline: new Date(deadline).toISOString(),
        file_path: storageData.path,
        created_by: currentUser.id
    }]);

    if (dbError) {
        alert('Database error: ' + dbError.message);
    } else {
        alert('Exam published successfully!');
        e.target.reset();
    }
});
