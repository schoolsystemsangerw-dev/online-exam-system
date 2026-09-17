import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://xowfbzcbeiwuffvlwhmn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h7p-pbw5WiGhvk-aKSyj5A_yMYB35yb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Helper function to sanitize text output
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Re-initialize Lucide Icons dynamically when components re-render
function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// ==========================================
// TAB SWITCH & AUTH UI LOGIC
// ==========================================
document.getElementById('tab-login')?.addEventListener('click', () => {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('tab-login').className = "w-1/2 py-3 text-center font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors";
    document.getElementById('tab-signup').className = "w-1/2 py-3 text-center font-semibold text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('tab-signup').className = "w-1/2 py-3 text-center font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors";
    document.getElementById('tab-login').className = "w-1/2 py-2 text-center font-semibold text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
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

    // 1. Create auth account passing user metadata
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
        // 2. Safe client-side insert into profiles table
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert([{
                id: authData.user.id,
                full_name: fullName,
                role: role
            }], { onConflict: 'id' });

        if (profileError) {
            console.warn("Profile table warning (trigger may have handled this):", profileError.message);
        }

        alert("Account created successfully!");
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
    
    let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile) {
        const fallbackName = user.user_metadata?.full_name || 'User';
        const fallbackRole = user.user_metadata?.role || 'student';
        
        const { data: newProfile } = await supabase
            .from('profiles')
            .upsert([{
                id: user.id,
                full_name: fallbackName,
                role: fallbackRole
            }], { onConflict: 'id' })
            .select()
            .maybeSingle();

        profile = newProfile;
    }

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'User';
    const role = profile?.role || user.user_metadata?.role || 'student';

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

    dataList.innerHTML = classes.map(c => `<option value="${escapeHtml(c.class_name)}">Code: ${escapeHtml(c.class_code)}</option>`).join('');
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
        teacherContainer.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">Loading published exams...</p>';

        const { data: exams, error } = await supabase
            .from('exams')
            .select('*')
            .eq('created_by', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            teacherContainer.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm">Failed to load exams: ${escapeHtml(error.message)}</p>`;
            return;
        }

        renderExams(exams, teacherContainer, false);
    } 
    else if (role === 'student' && studentContainer) {
        studentContainer.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">Loading available exams...</p>';

        const { data: enrollments, error: enrollError } = await supabase
            .from('class_enrollments')
            .select('class_id, classes(class_name)')
            .eq('student_id', currentUser.id);

        if (enrollError) {
            studentContainer.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm">Error fetching enrollments: ${escapeHtml(enrollError.message)}</p>`;
            return;
        }

        if (!enrollments || enrollments.length === 0) {
            studentContainer.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">You have not joined any classes yet. Enter a class code above to view exams.</p>';
            return;
        }

        const enrolledClassNames = enrollments.map(e => e.classes?.class_name).filter(Boolean);

        const { data: exams, error } = await supabase
            .from('exams')
            .select('*')
            .in('class_name', enrolledClassNames)
            .order('created_at', { ascending: false });

        if (error) {
            studentContainer.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm">Failed to load exams: ${escapeHtml(error.message)}</p>`;
            return;
        }

        renderExams(exams, studentContainer, true);
    }
}

// Render Redesigned HTML Exam Cards
function renderExams(exams, container, showUploadForm = false) {
    if (!exams || exams.length === 0) {
        container.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">No examinations available at the moment.</p>';
        return;
    }

    container.innerHTML = exams.map(exam => {
        const deadlineDate = new Date(exam.deadline);
        const isExpired = deadlineDate < new Date();

        return `
            <div class="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all duration-200 shadow-sm flex flex-col gap-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-lg text-slate-900">${escapeHtml(exam.title)}</h4>
                            <span class="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-200">${escapeHtml(exam.subject)}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span>Class: <strong class="text-slate-800">${escapeHtml(exam.class_name)}</strong></span>
                            <span>•</span>
                            <span>Total Marks: <strong class="text-slate-800">${exam.total_marks}</strong></span>
                            <span>•</span>
                            <span class="${isExpired ? 'text-rose-600 font-semibold' : 'text-slate-500'}">
                                Deadline: ${deadlineDate.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <button onclick="downloadExamPDF('${exam.file_path}')" class="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 shrink-0">
                        <i data-lucide="download" class="w-4 h-4"></i>
                        <span>Download PDF</span>
                    </button>
                </div>

                ${showUploadForm ? `
                <div class="border-t border-slate-200/80 pt-3 bg-indigo-50/50 p-4 rounded-xl border">
                    <label class="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                        <i data-lucide="upload-cloud" class="w-4 h-4 text-indigo-600"></i>
                        <span>Upload Completed Exam Paper (PDF):</span>
                    </label>
                    <div class="flex flex-col sm:flex-row gap-2.5">
                        <input type="file" id="submit-file-${exam.id}" accept=".pdf" class="border border-slate-300 text-xs p-1.5 rounded-xl flex-1 bg-white file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition">
                        <button onclick="uploadStudentSubmission('${exam.id}')" class="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5">
                            <i data-lucide="send" class="w-3.5 h-3.5"></i>
                            <span>Submit Work</span>
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');

    refreshIcons();
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
        container.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm">Error loading submissions: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        container.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">No student submissions uploaded yet.</p>';
        return;
    }

    container.innerHTML = submissions.map(sub => `
        <div class="border border-slate-200/80 p-5 rounded-2xl bg-slate-50/50 hover:bg-white transition-all duration-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="space-y-1">
                <p class="font-bold text-slate-900">${escapeHtml(sub.exams?.title || 'Exam Submission')}</p>
                <p class="text-xs text-slate-500">Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
                <button onclick="downloadExamPDF('${sub.file_path}')" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-1 inline-flex items-center gap-1 transition">
                    <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                    <span>Download Student File</span>
                </button>
            </div>
            <div class="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto bg-white p-2.5 rounded-xl border border-slate-200">
                <input type="number" id="marks-${sub.id}" placeholder="Marks / ${sub.exams?.total_marks || 100}" value="${sub.marks_obtained !== null ? sub.marks_obtained : ''}" class="border border-slate-300 px-3 py-1.5 text-xs rounded-lg w-full sm:w-32 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <input type="text" id="feedback-${sub.id}" placeholder="Optional feedback" value="${escapeHtml(sub.teacher_feedback || '')}" class="border border-slate-300 px-3 py-1.5 text-xs rounded-lg w-full sm:w-48 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <button onclick="submitStudentGrade('${sub.id}')" class="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs px-4 py-2 rounded-lg font-semibold transition shadow-sm w-full sm:w-auto flex items-center justify-center gap-1">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
                    <span>Save Grade</span>
                </button>
            </div>
        </div>
    `).join('');

    refreshIcons();
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
        container.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm">Error loading results: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        container.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">You have not submitted any completed exams yet.</p>';
        return;
    }

    container.innerHTML = submissions.map(sub => `
        <div class="border border-slate-200/80 p-5 rounded-2xl bg-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="space-y-1">
                <h4 class="font-bold text-slate-900">${escapeHtml(sub.exams?.title || 'Exam')}</h4>
                <p class="text-xs text-slate-500">Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
                ${sub.teacher_feedback ? `<p class="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 italic mt-2">💬 Feedback: "${escapeHtml(sub.teacher_feedback)}"</p>` : ''}
            </div>
            <div>
                ${sub.marks_obtained !== null 
                    ? `<span class="bg-emerald-100 text-emerald-800 font-bold px-3.5 py-1.5 rounded-full text-xs border border-emerald-200 inline-flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> ${sub.marks_obtained} / ${sub.exams?.total_marks} Marks</span>`
                    : `<span class="bg-amber-100 text-amber-800 font-semibold px-3 py-1.5 rounded-full text-xs border border-amber-200 inline-flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> Pending Grade</span>`
                }
            </div>
        </div>
    `).join('');

    refreshIcons();
}
