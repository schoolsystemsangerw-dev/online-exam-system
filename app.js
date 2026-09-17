// --- 1. RENDER STUDENT AVAILABLE EXAMS WITH UPLOAD FORM ---
function renderStudentExams(exams, container) {
    if (!exams || exams.length === 0) {
        container.innerHTML = '<p class="text-gray-500 py-4">No examinations available at the moment.</p>';
        return;
    }

    container.innerHTML = exams.map(exam => `
        <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm">
            <div class="flex justify-between items-center mb-3">
                <div>
                    <h4 class="font-bold text-lg text-blue-900">${exam.title} (${exam.subject})</h4>
                    <p class="text-sm text-gray-600">Class: <span class="font-semibold">${exam.class_name}</span> | Total Marks: <span class="font-semibold">${exam.total_marks}</span></p>
                    <p class="text-xs text-gray-500 mt-1">Deadline: ${new Date(exam.deadline).toLocaleString()}</p>
                </div>
                <button onclick="downloadExamPDF('${exam.file_path}')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm transition">
                    Download PDF
                </button>
            </div>

            <!-- Upload Work Section -->
            <div class="border-t pt-3 mt-3 bg-blue-50 p-3 rounded">
                <label class="block text-xs font-bold text-gray-700 mb-1">Upload Completed Exam Paper (PDF):</label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input type="file" id="submit-file-${exam.id}" accept=".pdf" class="border text-xs p-1.5 rounded flex-1 bg-white">
                    <button onclick="uploadStudentSubmission('${exam.id}')" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-1.5 rounded text-xs transition">
                        Submit Work
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// --- 2. STUDENT FILE UPLOAD HANDLER ---
window.uploadStudentSubmission = async function(examId) {
    const fileInput = document.getElementById(`submit-file-${examId}`);
    const file = fileInput?.files[0];

    if (!file) return alert("Please select your completed PDF file before uploading.");

    const filePath = `submissions/${Date.now()}_${currentUser.id}_${file.name.replace(/\s+/g, '_')}`;

    // Upload PDF to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
        .from('exam-papers')
        .upload(filePath, file);

    if (storageError) return alert('Upload Error: ' + storageError.message);

    // Save metadata entry in 'submissions' table
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
        loadStudentResults(); // Refresh student results section
    }
};

// --- 3. TEACHER DASHBOARD: LOAD & MARK SUBMISSIONS ---
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

// --- 4. TEACHER GRADE SAVING HANDLER ---
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

// --- 5. STUDENT DASHBOARD: LOAD RESULTS & MARKS ---
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
        <div class="border p-4 rounded-md bg-white shadow-sm flex justify-between items-center">
            <div>
                <h4 class="font-bold text-gray-800">${sub.exams?.title || 'Exam'}</h4>
                <p class="text-xs text-gray-500">Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
                ${sub.teacher_feedback ? `<p class="text-xs text-gray-600 italic mt-1">Feedback: "${sub.teacher_feedback}"</p>` : ''}
            </div>
            <div>
                ${sub.marks_obtained !== null 
                    ? `<span class="bg-green-100 text-green-800 font-bold px-3 py-1 rounded text-sm">${sub.marks_obtained} / ${sub.exams?.total_marks} Marks</span>`
                    : `<span class="bg-yellow-100 text-yellow-800 font-semibold px-3 py-1 rounded text-xs">Pending Grade</span>`
                }
            </div>
        </div>
    `).join('');
}
