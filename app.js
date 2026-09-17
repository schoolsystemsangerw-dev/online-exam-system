import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://xowfbzcbeiwuffvlwhmn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h7p-pbw5WiGhvk-aKSyj5A_yMYB35yb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ==========================================
// TAB SWITCH & AUTH UI LOGIC
// ==========================================
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
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'User';
    const role = profile?.role || user.user_metadata?.role || 'teacher';

    document.getElementById('auth-status').innerText = `${fullName} (${role.toUpperCase()})`;
    document.getElementById('logout-btn')?.classList.remove('hidden');
    document.getElementById('auth-section')?.classList.add('hidden');

    if (role === 'teacher') {
        document.getElementById('teacher-dashboard')?.classList.remove('hidden');
        loadTeacherClassesSelect();
        loadTeacherSubmissions();
    } else {
        document.getElementById('student-dashboard')?.classList.remove('hidden');
        loadStudentResults();
    }

    // Load exams for logged-in user
    loadExams(role);
}

// ==========================================
// CLASS CREATION & ENROLLMENT HANDLERS
// ==========================================

// 1. Teacher Creates a New Class
document.getElementById('create-class-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const className = document.getElementById('class-title').value;
    const subject = document.getElementById('class-subject').value;
    const classCode = document.getElementById('class-code').value.toUpperCase().trim();

    const { error } = await supabase.from('classes').insert([{
        class_name: className,
        subject: subject,
        class_code: classCode,
        teacher_id: currentUser.id
    }]);

    if (error) {
        alert("Error creating class code: " + error.message);
    } else {
        alert(`Class created successfully!\nShare code: [ ${classCode} ] with your students.`);
        e.target.reset();
        loadTeacherClassesSelect();
    }
});

// 2. Load Teacher Classes into Exam Creation Form Options
async function loadTeacherClassesSelect() {
    const classInput = document.getElementById('exam-class');
    if (!classInput || !currentUser) return;

    const { data: classes, error } = await supabase
        .from('classes')
        .select('id, class_name, class_code')
        .eq('teacher_id', currentUser.id);

    if (error || !classes || classes.length === 0) return;

    let dataList = document.getElementById('teacher-classes-list');
    if (!dataList) {
        dataList = document.createElement('datalist');
        dataList.id = 'teacher-classes-list';
        document.body.appendChild(dataList);
        classInput.setAttribute('list', 'teacher-classes-list');
    }

    dataList.innerHTML = classes.map(c => `<option value="${c.class_name}">Code: ${c.class_code}</option>`).join('');
}

// 3. Student Joins Class Using Join Code
document.getElementById('join-class-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputCode = document.getElementById('join-code').value.toUpperCase().trim();

    const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, class_name, subject')
        .eq('class_code', inputCode)
        .single();

    if (classError || !classData) {
        return alert("Invalid class code. Please confirm with your teacher.");
    }

    const { error: enrollError } = await supabase
        .from('class_enrollments')
        .insert([{ student_id: currentUser.id, class_id: classData.id }]);

    if (enrollError) {
        if (enrollError.code === '23505') {
            alert("You are already enrolled in this class.");
        } else {
            alert("Error joining class: " + enrollError.message);
        }
    } else {
        alert(`Successfully joined ${classData.class_name} (${classData.subject})!`);
        e.target.reset();
        loadExams('student');
    }
});

// ==========================================
// EXAM FETCHING & SUBMISSION HANDLERS
// ==========================================

// Teacher Exam Creation Handler
document.getElementById('create-exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('exam-title').value;
    const subject = document.getElementById('exam-subject').value;
    const className = document.getElementById('exam-class').value;
    const totalMarks = document.getElementById('exam-marks').value;
    const deadline = document.getElementById('exam-deadline').value;
    const file = document.getElementById('exam-file').files[0];

    if (!file) return alert("Please select a PDF file to upload.");

    const filePath = `exams/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

    const { data: storageData, error: storageError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file);

    if (storageError) {
        return alert('Storage upload error: ' + storageError.message);
    }

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
        loadExams('teacher');
    }
});

// Fetch and Render Exams Filtered by User Role & Enrollments
async function loadExams(role = 'student') {
    const studentContainer = document.getElementById('exams-list');
    const teacherContainer = document.getElementById('teacher-exams-list');

    if (role === 'teacher' && teacherContainer) {
        teacherContainer.innerHTML = '<p class="text-gray-500 py-4">Loading exams...</p>';

        const { data: exams, error } = await supabase
            .from('exams')
            .select('*')
            .eq('created_by', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            teacherContainer.innerHTML = `<p class="text-red-500 py-4">Failed to load exams: ${error.message}</p>`;
            return;
        }

        renderExams(exams, teacherContainer, false);
    } 
    else if (role === 'student' && studentContainer) {
        studentContainer.innerHTML = '<p class="text-gray-500 py-4">Loading exams...</p>';

        const { data: enrollments, error: enrollError } = await supabase
            .from('class_enrollments')
            .select('class_id, classes(class_name)')
            .eq('student_id', currentUser.id);

        if (enrollError) {
            studentContainer.innerHTML = `<p class="text-red-500 py-4">Error fetching enrollments: ${enrollError.message}</p>`;
            return;
        }

        if (!enrollments || enrollments.length === 0) {
            studentContainer.innerHTML = '<p class="text-gray-500 py-4">You have not joined any classes yet. Enter a class code above to view exams.</p>';
            return;
        }

        const enrolledClassNames = enrollments.map(e => e.classes?.class_name).filter(Boolean);

        const { data: exams, error } = await supabase
            .from('exams')
            .select('*')
            .in('class_name', enrolledClassNames)
            .order('created_at', { ascending: false });

        if (error) {
            studentContainer.innerHTML = `<p class="text-red-500 py-4">Failed to load exams: ${error.message}</p>`;
            return;
        }

        renderExams(exams, studentContainer, true);
    }
}

// Render HTML Exam Cards
function renderExams(exams, container, showUploadForm = false) {
    if (!exams || exams.length === 0) {
        container.innerHTML = '<p class="text-gray-500 py-4">No examinations available at the moment.</p>';
        return;
    }

    container.innerHTML = exams.map(exam => `
        <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm flex flex-col gap-3">
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-lg text-blue-900">${exam.title} (${exam.subject})</h4>
                    <p class="text-sm text-gray-600">Class: <span class="font-semibold">${exam.class_name}</span> | Total Marks: <span class="font-semibold">${exam.total_marks}</span></p>
                    <p class="text-xs text-gray-500 mt-1">Deadline: ${new Date(exam.deadline).toLocaleString()}</p>
                </div>
                <button onclick="downloadExamPDF('${exam.file_path}')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm transition">
                    Download PDF
                </button>
            </div>

            ${showUploadForm ? `
            <div class="border-t pt-3 bg-blue-50 p-3 rounded">
                <label class="block text-xs font-bold text-gray-700 mb-1">Upload Completed Exam Paper (PDF):</label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input type="file" id="submit-file-${exam.id}" accept=".pdf" class="border text-xs p-1.5 rounded flex-1 bg-white">
                    <button onclick="uploadStudentSubmission('${exam.id}')" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-1.5 rounded text-xs transition">
                        Submit Work
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
    `).join('');
}

// Download/View PDF Handler
window.downloadExamPDF = async function(filePath) {
    const { data, error } = await supabase.storage
        .from('exam-papers')
        .createSignedUrl(filePath, 60);

    if (error) {
        alert("Error retrieving file: " + error.message);
    } else if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
    }
};

// ==========================================
// STUDENT SUBMISSION & TEACHER GRADING
// ==========================================

// Student Upload Completed Paper
window.uploadStudentSubmission = async function(examId) {
    const fileInput = document.getElementById(`submit-file-${examId}`);
    const file = fileInput?.files[0];

    if (!file) return alert("Please select your completed PDF file before uploading.");

    const filePath = `submissions/${Date.now()}_${currentUser.id}_${file.name.replace(/\s+/g, '_')}`;

    const { data: storageData, error: storageError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file);

    if (storageError) return alert('Upload Error: ' + storageError.message);

    const { error: dbError } = await supabase.from('submissions').upsert([{
        exam_id: examId,
        student_id: currentUser.id,
        file_path: storageData.path,
        submitted_at: new Date().toISOString()
    }], { onConflict: 'exam_id,student_id' });

    if (dbError) {
        alert('Database Error: ' + dbError.message);
    } else {
        alert('Your completed exam has been successfully uploaded for marking!');
        fileInput.value = '';
        loadStudentResults();
    }
};

// Teacher Portal: Load Student Submissions
async function loadTeacherSubmissions() {
    const container = document.getElementById('teacher-submissions-list');
    if (!container) return;

    const { data: submissions, error } = await supabase
        .from('submissions')
        .select(`
            *,
            exams(title, total_marks)
        `)
        .order('submitted_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-red-500 py-2">Error loading submissions: ${error.message}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 py-2">No student submissions uploaded yet.</p>';
        return;
    }

    container.innerHTML = submissions.map(sub => `
        <div class="border p-4 rounded-md bg-gray-50 mb-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <p class="font-bold text-gray-800">${sub.exams?.title || 'Exam Submission'}</p>
                <p class="text-xs text-gray-500">Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
                <button onclick="downloadExamPDF('${sub.file_path}')" class="text-xs text-blue-600 underline font-semibold mt-1 inline-block">
                    📥 Download Student File
                </button>
            </div>
            <div class="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                <input type="number" id="marks-${sub.id}" placeholder="Marks / ${sub.exams?.total_marks || 100}" value="${sub.marks_obtained !== null ? sub.marks_obtained : ''}" class="border p-1.5 text-sm rounded w-full sm:w-32">
                <input type="text" id="feedback-${sub.id}" placeholder="Optional feedback" value="${sub.teacher_feedback || ''}" class="border p-1.5 text-sm rounded w-full sm:w-48">
                <button onclick="submitStudentGrade('${sub.id}')" class="bg-blue-600 text-white text-xs px-4 py-2 rounded font-semibold hover:bg-blue-700 transition w-full sm:w-auto">
                    Save Grade
                </button>
            </div>
        </div>
    `).join('');
}

// Teacher Saves Marks and Feedback
window.submitStudentGrade = async function(submissionId) {
    const marks = document.getElementById(`marks-${submissionId}`).value;
    const feedback = document.getElementById(`feedback-${submissionId}`).value;

    if (marks === "") return alert("Please enter marks before saving.");

    const { error } = await supabase
        .from('submissions')
        .update({
            marks_obtained: parseFloat(marks),
            teacher_feedback: feedback,
            graded_at: new Date().toISOString()
        })
        .eq('id', submissionId);

    if (error) {
        alert("Error saving marks: " + error.message);
    } else {
        alert("Marks and feedback saved successfully!");
        loadTeacherSubmissions();
    }
};

// Student Portal: Load Scores & Feedback
async function loadStudentResults() {
    const container = document.getElementById('student-results-list');
    if (!container) return;

    const { data: submissions, error } = await supabase
        .from('submissions')
        .select(`
            *,
            exams(title, total_marks)
        `)
        .eq('student_id', currentUser.id);

    if (error) {
        container.innerHTML = `<p class="text-red-500 py-2">Error loading results: ${error.message}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 py-2">You have not submitted any completed exams yet.</p>';
        return;
    }

    container.innerHTML = submissions.map(sub => `
        <div class="border p-4 rounded-md bg-white shadow-sm flex justify-between items-center mb-3">
            <div>
                <h4 class="font-bold text-gray-800">${sub.exams?.title || 'Exam'}</h4>
                <p class="text-xs text-gray-500">Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
                ${sub.teacher_feedback ? `<p class="text-xs text-gray-600 italic mt-1">Feedback: "${sub.teacher_feedback}"</p>` : ''}
            </div>
            <div>
                ${sub.marks_obtained !== null 
                    ? `<span class="bg-green-100 text-green-800 font-bold px-3 py-1 rounded text-sm">${sub.marks_obtained} /${sub.exams?.total_marks} Marks</span>`
                    : `<span class="bg-yellow-100 text-yellow-800 font-semibold px-3 py-1 rounded text-xs">Pending Grade</span>`
                }
            </div>
        </div>
    `).join('');
}
