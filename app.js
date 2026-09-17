import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Your Supabase credentials
const SUPABASE_URL = 'https://xowfbzcbeiwuffvlwhmn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h7p-pbw5WiGhvk-aKSyj5A_yMYB35yb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Initialize Session Check
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        handleUserLogin(session.user);
    }
});

// Login Form Submit
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

async function handleUserLogin(user) {
    currentUser = user;
    
    // Fetch Role from Profiles
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        alert("Error fetching profile: " + error.message);
        return;
    }

    document.getElementById('auth-status').innerText = `${profile.full_name} (${profile.role.toUpperCase()})`;
    document.getElementById('auth-section').classList.add('hidden');

    if (profile.role === 'teacher') {
        document.getElementById('teacher-dashboard').classList.remove('hidden');
    } else {
        document.getElementById('student-dashboard').classList.remove('hidden');
    }
}

// Teacher: Upload Exam File & Publish
document.getElementById('create-exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('exam-title').value;
    const subject = document.getElementById('exam-subject').value;
    const className = document.getElementById('exam-class').value;
    const totalMarks = document.getElementById('exam-marks').value;
    const deadline = document.getElementById('exam-deadline').value;
    const file = document.getElementById('exam-file').files[0];

    const filePath = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

    // 1. Upload to Storage
    const { data: storageData, error: storageError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file);

    if (storageError) return alert('Storage upload error: ' + storageError.message);

    // 2. Insert to Database Table
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
