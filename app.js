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
    document.getElementById('login-form')?.classList.remove('hidden');
    document.getElementById('signup-form')?.classList.add('hidden');
    document.getElementById('tab-login').className = "w-1/2 py-3 text-center font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors";
    document.getElementById('tab-signup').className = "w-1/2 py-3 text-center font-semibold text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
    document.getElementById('signup-form')?.classList.remove('hidden');
    document.getElementById('login-form')?.classList.add('hidden');
    document.getElementById('tab-signup').className = "w-1/2 py-3 text-center font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors";
    document.getElementById('tab-login').className = "w-1/2 py-3 text-center font-semibold text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
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
    const fullName = document.getElementById('signup-name')?.value || '';
    const email = document.getElementById('signup-email')?.value || '';
    const password = document.getElementById('signup-password')?.value || '';
    const role = document.getElementById('signup-role')?.value || 'student';
    
    const phone = document.getElementById('signup-phone')?.value || '';
    const address = document.getElementById('signup-address')?.value || '';

    // 1. Create auth account with metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { 
                full_name: fullName, 
                role: role,
                phone_number: phone,
                physical_address: address
            }
        }
    });

    if (authError) {
        alert("Registration Error: " + authError.message);
    } else if (authData.user) {
        // 2. Insert into profiles table with matching schema columns
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert([{
                id: authData.user.id,
                full_name: fullName,
                role: role,
                phone_number: phone,
                physical_address: address
            }], { onConflict: 'id' });

        if (profileError) {
            console.warn("Profile table error:", profileError.message);
        }

        alert("Account created successfully!");
        handleUserLogin(authData.user);
    }
});

// Login Handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value || '';
    const password = document.getElementById('password')?.value || '';

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

    const authStatus = document.getElementById('auth-status');
    if (authStatus) authStatus.innerText = `${fullName} (${role.toUpperCase()})`;
    
    document.getElementById('logout-btn')?.classList.remove('hidden');
    document.getElementById('auth-section')?.classList.add('hidden');

    if (role === 'teacher') {
        document.getElementById('teacher-dashboard')?.classList.remove('hidden');
        document.getElementById('student-dashboard')?.classList.add('hidden');
        loadTeacherClassesSelect();
        loadTeacherClassesAndStudents();
        loadTeacherSubmissions();
   } else {
      document.getElementById('student-dashboard')?.classList.remove('hidden');
      document.getElementById('teacher-dashboard')?.classList.add('hidden');
      loadStudentResults();
      loadStudentTeachers(user.id); // <--- Pass user.id here
  }

    loadExams(role);
}

// Fetch enrolled teacher details for students
// Fetch enrolled teacher details for students
async function loadStudentTeachers(studentId) {
    const container = document.getElementById('teachers-list');
    if (!container) return;

    // Fetch class enrollments and joined profiles
    const { data, error } = await supabase
        .from('class_enrollments')
       .select(`
            id,
            classes (
                id,
                class_name,
                subject,
                profiles:teacher_id (
                    id,
                    full_name,
                    phone,
                    address
                )
            )
        `)
        `)
        .eq('student_id', studentId);

    if (error) {
        container.innerHTML = `<div class="p-4 bg-rose-50 text-rose-700 rounded-xl text-sm">Error loading teachers: ${escapeHtml(error.message)}</div>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-slate-500 py-4 text-center italic border border-dashed border-slate-200 rounded-xl col-span-2">Join a class above using a valid class code to view your teacher's contact details.</p>`;
        return;
    }

    // Map unique teachers
    const teachersMap = new Map();
    data.forEach(item => {
        const teacher = item.classes?.profiles;
        if (teacher && !teachersMap.has(teacher.id)) {
            teachersMap.set(teacher.id, teacher);
        }
    });

    if (teachersMap.size === 0) {
        container.innerHTML = `<p class="text-slate-500 py-4 text-center italic border border-dashed border-slate-200 rounded-xl col-span-2">No teacher information found for joined classes.</p>`;
        return;
    }

    container.innerHTML = Array.from(teachersMap.values()).map(teacher => `
        <div class="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-col gap-2">
            <div class="flex items-center gap-2">
                <i data-lucide="user" class="w-4 h-4 text-indigo-600"></i>
               <h3 class="font-bold text-slate-900 text-base">${escapeHtml(teacher.full_name || 'Teacher')}</h3>
            </div>
            <div class="text-xs text-slate-600 space-y-1.5 pl-6">
                <p class="flex items-center gap-2">
                    <i data-lucide="phone" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span><strong>Phone:</strong> ${escapeHtml(teacher.phone || 'N/A')}</span>
                </p>
                <p class="flex items-center gap-2">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span><strong>Location:</strong> ${escapeHtml(teacher.address || 'N/A')}</span>
                </p>
            </div>
        </div>
    `).join('');

    refreshIcons();
}

// ==========================================
// CLASS CREATION & ENROLLMENT HANDLERS
// ==========================================

// 1. Teacher Creates a New Class
document.getElementById('create-class-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const className = document.getElementById('class-title')?.value || '';
    const subject = document.getElementById('class-subject')?.value || '';
    const classCode = (document.getElementById('class-code')?.value || '').toUpperCase().trim();

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
        loadTeacherClassesAndStudents();
    }
});

// 2. Load Teacher Classes into Drop-down (<select>)
async function loadTeacherClassesSelect() {
    const classSelect = document.getElementById('exam-class');
    if (!classSelect || !currentUser) return;

    const { data: classes, error } = await supabase
        .from('classes')
        .select('id, class_name, class_code, subject')
        .eq('teacher_id', currentUser.id)
        .order('class_name', { ascending: true });

    if (error) {
        console.error("Error fetching teacher classes:", error.message);
        return;
    }

    classSelect.innerHTML = '<option value="">-- Select Created Class --</option>';

    if (!classes || classes.length === 0) {
        classSelect.innerHTML += '<option value="" disabled>No classes created yet</option>';
        return;
    }

    classes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.class_name;
        option.textContent = `${c.class_name} (${c.subject}) - Code: ${c.class_code}`;
        classSelect.appendChild(option);
    });
}

// 3. Load Teacher's Created Classes and Enrolled Students
window.loadTeacherClassesAndStudents = async function() {
    const container = document.getElementById('teacher-classes-cards');
    if (!container || !currentUser) return;

    container.innerHTML = '<p class="text-slate-500 py-4 text-center italic border border-dashed border-slate-200 rounded-xl col-span-2">Loading classes and enrolled students...</p>';

    const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (classError) {
        container.innerHTML = `<p class="text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 text-sm col-span-2">Error loading classes: ${escapeHtml(classError.message)}</p>`;
        return;
    }

    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="text-slate-500 py-6 text-center italic border border-dashed border-slate-200 rounded-xl col-span-2">You have not created any class codes yet.</p>';
        return;
    }

    const classIds = classes.map(c => c.id);
    const { data: enrollments, error: enrollError } = await supabase
        .from('class_enrollments')
        .select('class_id, student_id, profiles(full_name)')
        .in('class_id', classIds);

    if (enrollError) {
        console.warn("Could not fetch enrollment details:", enrollError.message);
    }

    const studentMap = {};
    if (enrollments) {
        enrollments.forEach(item => {
            if (!studentMap[item.class_id]) {
                studentMap[item.class_id] = [];
            }
            if (item.profiles?.full_name) {
                studentMap[item.class_id].push(item.profiles.full_name);
            }
        });
    }

    container.innerHTML = classes.map(c => {
        const students = studentMap[c.id] || [];
        return `
            <div class="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 hover:bg-white transition-all duration-200 shadow-sm flex flex-col justify-between gap-4">
                <div class="space-y-2">
                    <div class="flex justify-between items-start gap-2">
                        <h4 class="font-bold text-slate-900 text-lg">${escapeHtml(c.class_name)}</h4>
                        <span class="bg-indigo-100 text-indigo-800 text-xs font-mono font-bold px-3 py-1 rounded-full border border-indigo-200 shrink-0">
                            Code: ${escapeHtml(c.class_code)}
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 font-medium">Subject: <span class="text-slate-800 font-semibold">${escapeHtml(c.subject)}</span></p>
                </div>

                <div class="border-t border-slate-200/80 pt-3">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <i data-lucide="users" class="w-3.5 h-3.5 text-indigo-600"></i>
                            Enrolled Students
                        </span>
                        <span class="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold">
                            ${students.length}
                        </span>
                    </div>

                    ${students.length > 0 ? `
                        <ul class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            ${students.map(name => `
                                <li class="text-xs bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                                    <i data-lucide="user-check" class="w-3.5 h-3.5 text-emerald-500 shrink-0"></i>
                                    <span class="font-medium">${escapeHtml(name)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : `
                        <p class="text-xs text-slate-400 italic bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                            No students enrolled yet.
                        </p>
                    `}
                </div>
            </div>
        `;
    }).join('');

    refreshIcons();
};

// 4. Student Joins Class Using Join Code
document.getElementById('join-class-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputCode = (document.getElementById('join-code')?.value || '').toUpperCase().trim();

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
        loadStudentTeachers(currentUser.id);
    }
});
// ==========================================
// EXAM FETCHING & SUBMISSION HANDLERS
// ==========================================

// Teacher Exam Creation Handler
document.getElementById('create-exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('exam-title')?.value || '';
    const subject = document.getElementById('exam-subject')?.value || '';
    const className = document.getElementById('exam-class')?.value || '';
    const totalMarks = document.getElementById('exam-marks')?.value || '';
    const deadline = document.getElementById('exam-deadline')?.value || '';
    const file = document.getElementById('exam-file')?.files[0];

    if (!className) return alert("Please select a target class.");
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

// Fetch and Render Exams Filtered by User Role
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

// Teacher Portal: Load Student Submissions with Enrolled Student Names
async function loadTeacherSubmissions() {
    const container = document.getElementById('teacher-submissions-list');
    if (!container) return;

    const { data: submissions, error } = await supabase
        .from('submissions')
        .select(`
            *,
            exams(title, total_marks),
            profiles(full_name)
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

    container.innerHTML = submissions.map(sub => {
        const studentName = sub.profiles?.full_name || 'Student';
        return `
            <div class="border border-slate-200/80 p-5 rounded-2xl bg-slate-50/50 hover:bg-white transition-all duration-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <p class="font-bold text-slate-900">${escapeHtml(sub.exams?.title || 'Exam Submission')}</p>
                        <span class="bg-slate-200 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                            ${escapeHtml(studentName)}
                        </span>
                    </div>
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
        `;
    }).join('');

    refreshIcons();
}

// Teacher Saves Marks and Feedback
window.submitStudentGrade = async function(submissionId) {
    const marks = document.getElementById(`marks-${submissionId}`)?.value || '';
    const feedback = document.getElementById(`feedback-${submissionId}`)?.value || '';

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
                    ? `<span class="bg-emerald-100 text-emerald-800 font-bold px-3.5 py-1.5 rounded-full text-xs border border-emerald-200 inline-flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> ${sub.marks_obtained} /${sub.exams?.total_marks} Marks</span>`
                    : `<span class="bg-amber-100 text-amber-800 font-semibold px-3 py-1.5 rounded-full text-xs border border-amber-200 inline-flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> Pending Grade</span>`
                }
            </div>
        </div>
    `).join('');

    refreshIcons();
}
