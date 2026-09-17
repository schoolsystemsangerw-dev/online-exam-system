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
    
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        alert("Profile fetch error: " + error.message);
        return;
    }

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'User';
    const role = profile?.role || user.user_metadata?.role || 'teacher';

    document.getElementById('auth-status').innerText = `${fullName} (${role.toUpperCase()})`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-section').classList.add('hidden');

    if (role === 'teacher') {
        document.getElementById('teacher-dashboard')?.classList.remove('hidden');
    } else {
        document.getElementById('student-dashboard')?.classList.remove('hidden');
    }

    // Load exams for logged-in user
    loadExams();
}

// Fetch and Render Exams
async function loadExams() {
    const listContainer = document.getElementById('exams-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="text-gray-500 py-4">Loading exams...</p>';

    const { data: exams, error } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error loading exams:", error);
        listContainer.innerHTML = `<p class="text-red-500 py-4">Failed to load exams: ${error.message}</p>`;
        return;
    }

    if (!exams || exams.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 py-4">No examinations available at the moment.</p>';
        return;
    }

    listContainer.innerHTML = exams.map(exam => `
        <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm hover:shadow-md transition flex justify-between items-center">
            <div>
                <h4 class="font-bold text-lg text-blue-900">${exam.title} (${exam.subject})</h4>
                <p class="text-sm text-gray-600">Class: <span class="font-semibold">${exam.class_name}</span> | Total Marks: <span class="font-semibold">${exam.total_marks}</span></p>
                <p class="text-xs text-gray-500 mt-1">Deadline: ${new Date(exam.deadline).toLocaleString()}</p>
            </div>
            <button onclick="downloadExamPDF('${exam.file_path}')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm transition">
                Download PDF
            </button>
        </div>
    `).join('');
}

// Download/View PDF Handler
window.downloadExamPDF = async function(filePath) {
    const { data, error } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(filePath);

    if (error) {
        alert("Error retrieving file: " + error.message);
    } else if (data?.publicUrl) {
        window.open(data.publicUrl, '_blank');
    }
};

// Teacher Exam Creation Handler
document.getElementById('create-exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('exam-title').value;
    const subject = document.getElementById('exam-subject').value;
    const className = document.getElementById('exam-class').value;
    const totalMarks = document.getElementById('exam-marks').value;
    const deadline = document.getElementById('exam-deadline').value;
    const file = document.getElementById('exam-file').files[0];

    if (!file) {
        return alert("Please select a PDF file to upload.");
    }

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
        loadExams(); // Refresh list immediately after posting
    }
});
