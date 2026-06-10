import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { pushNotification } from "./notifications";
import { fmtMY } from "@/lib/datetime";
import { writeAudit } from "./audit";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

async function notifyEnrolledStudents(
  supabase: ReturnType<typeof createClient>,
  classId: string,
  payload: { type: string; title: string; body: string; link: string }
) {
  const { data: enrollments } = await db(supabase)
    .from("class_enrollments")
    .select("student_id")
    .eq("class_id", classId);
  if (!enrollments?.length) return;
  await Promise.all(
    enrollments.map((e: any) => pushNotification(supabase, { userId: e.student_id, ...payload }))
  );
}

export const getLecturerClasses = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: classes, error } = await db(supabase)
      .from("classes")
      .select("*, profiles!lecturer_id(name)")
      .eq("lecturer_id", user.id);

    if (error) throw new Error(error.message);

    const { data: counts } = await db(supabase)
      .from("class_enrollments")
      .select("class_id");

    return (classes as any[]).map((c: any) => ({
      ...c,
      students: (counts as any[])?.filter((cnt: any) => cnt.class_id === c.id).length || 0,
    }));
  });

export const getStudentClasses = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: enrollments, error } = await db(supabase)
      .from("class_enrollments")
      .select("*, classes(*, profiles!lecturer_id(name))")
      .eq("student_id", user.id);

    if (error) throw new Error(error.message);

    const { data: allEnrollments } = await db(supabase)
      .from("class_enrollments")
      .select("class_id");

    return (enrollments as any[]).map((e: any) => ({
      ...e.classes,
      lecturer: e.classes?.profiles?.name || "Unknown",
      students: (allEnrollments as any[])?.filter((cnt: any) => cnt.class_id === e.class_id).length || 0,
    }));
  });

export const getClassDetail = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: classInfo, error: classError } = await db(supabase)
      .from("classes")
      .select("*, profiles!lecturer_id(name)")
      .eq("id", classId)
      .single();

    if (classError) throw new Error(classError.message);

    const { data: announcements } = await db(supabase)
      .from("announcements")
      .select("*, profiles!author_id(name)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false });

    const { data: notes } = await db(supabase)
      .from("class_notes")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false });

    const { data: exams } = await db(supabase)
      .from("exams")
      .select("*")
      .eq("class_id", classId)
      .order("start_time", { ascending: false });

    const { count: studentCount } = await db(supabase)
      .from("class_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("class_id", classId);

    return {
      classInfo: {
        ...(classInfo as any),
        lecturer: (classInfo as any)?.profiles?.name || "Unknown",
        students: studentCount || 0,
      },
      announcements: (announcements as any[] | null)?.map((a: any) => ({
        ...a,
        author: a.profiles?.name || "Unknown",
        date: fmtMY(a.created_at, { dateStyle: "short" }),
      })) || [],
      notes: (notes as any[]) || [],
      exams: (exams as any[]) || [],
    };
  });

export const createClass = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; name: string; color: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Only lecturers can create classes");
    }

    const { data: newClass, error } = await db(supabase)
      .from("classes")
      .insert({ code: data.code, name: data.name, color: data.color, lecturer_id: user.id })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return newClass;
  });

export const postAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: { classId: string; title: string; body: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await db(supabase)
      .from("announcements")
      .insert({ class_id: data.classId, author_id: user.id, title: data.title, body: data.body });

    if (error) throw new Error(error.message);

    try {
      const { data: cls } = await db(supabase).from("classes").select("name, code").eq("id", data.classId).single();
      await notifyEnrolledStudents(supabase, data.classId, {
        type: "announcement",
        title: `[${cls?.code ?? "Class"}] ${data.title}`,
        body: data.body.slice(0, 120),
        link: `/student/classes/${data.classId}`,
      });
    } catch {}

    return { success: true };
  });

export const joinClass = createServerFn({ method: "POST" })
  .inputValidator((code: string) => code)
  .handler(async ({ data: code }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "student") {
      throw new Error("Only students can join classes");
    }

    const { data: classInfo, error: classError } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("code", code)
      .single();

    if (classError) throw new Error("Invalid class code");

    const { error: enrollError } = await db(supabase)
      .from("class_enrollments")
      .insert({ class_id: (classInfo as any).id, student_id: user.id });

    if (enrollError) {
      if (enrollError.code === "23505") throw new Error("You are already enrolled in this class");
      throw new Error(enrollError.message);
    }

    return { success: true, classId: (classInfo as any).id };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .inputValidator((noteId: string) => noteId)
  .handler(async ({ data: noteId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { error } = await db(supabase)
      .from("class_notes")
      .delete()
      .eq("id", noteId)
      .eq("author_id", user.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const addNote = createServerFn({ method: "POST" })
  .inputValidator((data: { classId: string; title: string; description: string; fileType: "pdf" | "image" | "file"; fileName: string; fileUrl?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Only lecturers can add notes");
    }

    const { data: note, error } = await db(supabase)
      .from("class_notes")
      .insert({ class_id: data.classId, author_id: user.id, title: data.title, description: data.description, file_type: data.fileType, file_name: data.fileName, file_url: data.fileUrl ?? null })
      .select()
      .single();

    if (error) throw new Error(error.message);

    try {
      const { data: cls } = await db(supabase).from("classes").select("code").eq("id", data.classId).single();
      await notifyEnrolledStudents(supabase, data.classId, {
        type: "note_added",
        title: `[${cls?.code ?? "Class"}] New note: ${data.title}`,
        body: data.description.slice(0, 120),
        link: `/student/classes/${data.classId}`,
      });
    } catch {}

    return note;
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((annId: string) => annId)
  .handler(async ({ data: annId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { error } = await db(supabase)
      .from("announcements")
      .delete()
      .eq("id", annId)
      .eq("author_id", user.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getClassMembers = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { data, error } = await db(supabase)
      .from("class_enrollments")
      .select("*, profiles!student_id(id, name, status)")
      .eq("class_id", classId);

    if (error) throw new Error(error.message);

    return (data as any[]).map((e: any) => ({
      studentId: e.profiles?.id || e.student_id,
      name: e.profiles?.name || "Unknown",
      status: e.profiles?.status || "active",
      enrolledAt: e.enrolled_at,
    }));
  });

export const removeStudent = createServerFn({ method: "POST" })
  .inputValidator((data: { classId: string; studentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    // Verify the lecturer owns the class before removing a student.
    const { data: cls } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("id", data.classId)
      .eq("lecturer_id", user.id)
      .maybeSingle();

    if (!cls) throw new Error("Forbidden — you do not own this class");

    const { error } = await db(supabase)
      .from("class_enrollments")
      .delete()
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const createAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: { classId: string; title: string; description?: string; fileUrl?: string; fileName?: string; fileType?: "pdf" | "image" | "file"; maxScore?: number | null; startAt: string; endAt: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Only lecturers can create assignments");
    }

    const { data: assignment, error } = await db(supabase)
      .from("class_assignments")
      .insert({
        class_id: data.classId,
        lecturer_id: user.id,
        title: data.title,
        description: data.description ?? null,
        file_url: data.fileUrl ?? null,
        file_name: data.fileName ?? null,
        file_type: data.fileType ?? null,
        max_score: data.maxScore ?? null,
        start_at: data.startAt,
        end_at: data.endAt,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    try {
      const { data: cls } = await db(supabase).from("classes").select("code").eq("id", data.classId).single();
      const deadline = fmtMY(data.endAt, { dateStyle: "medium", timeStyle: "short" });
      await notifyEnrolledStudents(supabase, data.classId, {
        type: "assignment_posted",
        title: `[${cls?.code ?? "Class"}] New assignment: ${data.title}`,
        body: `Due ${deadline}${data.description ? " — " + data.description.slice(0, 80) : ""}`,
        link: `/student/classes/${data.classId}`,
      });
    } catch {}

    return assignment;
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .inputValidator((assignmentId: string) => assignmentId)
  .handler(async ({ data: assignmentId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { error } = await db(supabase)
      .from("class_assignments")
      .delete()
      .eq("id", assignmentId)
      .eq("lecturer_id", user.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getClassAssignments = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await db(supabase)
      .from("class_assignments")
      .select("*")
      .eq("class_id", classId)
      .order("start_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  });

export const submitToAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: { assignmentId: string; classId: string; fileUrl: string; fileName: string; fileType: "pdf" | "image" | "file" }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "student") {
      throw new Error("Only students can submit");
    }

    // Enforce deadline on the server — the client timer is advisory only.
    const { data: assignment } = await db(supabase)
      .from("class_assignments")
      .select("end_at, title, lecturer_id")
      .eq("id", data.assignmentId)
      .single();

    if (!assignment) throw new Error("Assignment not found");
    if (new Date() > new Date(assignment.end_at)) {
      throw new Error("The submission deadline has passed");
    }

    // Resubmission: if the student already has a submission that hasn't been
    // reviewed yet, UPDATE it (replace file + reset status). A reviewed
    // submission is final — the lecturer has already graded it.
    const { data: existing } = await db(supabase)
      .from("assignment_submissions")
      .select("id, status")
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "reviewed") {
        throw new Error("Your submission has already been reviewed and cannot be changed");
      }
      const { data: submission, error } = await db(supabase)
        .from("assignment_submissions")
        .update({
          file_url: data.fileUrl,
          file_name: data.fileName,
          file_type: data.fileType,
          status: "submitted",
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return submission;
    }

    const { data: submission, error } = await db(supabase)
      .from("assignment_submissions")
      .insert({
        assignment_id: data.assignmentId,
        class_id: data.classId,
        student_id: user.id,
        file_url: data.fileUrl,
        file_name: data.fileName,
        file_type: data.fileType,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    try {
      const { data: profile } = await db(supabase).from("profiles").select("name").eq("id", user.id).single();
      if (assignment?.lecturer_id) {
        await pushNotification(supabase, {
          userId: assignment.lecturer_id,
          type: "assignment_submitted",
          title: `Assignment submitted: ${assignment.title}`,
          body: `${profile?.name ?? "A student"} submitted their work`,
          link: `/lecturer/classes/${data.classId}`,
        });
      }
    } catch {}

    return submission;
  });

export const getMyAssignmentSubmissions = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "student") {
      throw new Error("Unauthorized");
    }

    const { data, error } = await db(supabase)
      .from("assignment_submissions")
      .select("*")
      .eq("class_id", classId)
      .eq("student_id", user.id);

    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  });

export const getAssignmentSubmissions = createServerFn({ method: "GET" })
  .inputValidator((assignmentId: string) => assignmentId)
  .handler(async ({ data: assignmentId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { data, error } = await db(supabase)
      .from("assignment_submissions")
      .select("*, profiles!student_id(name)")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as any[]).map((s: any) => ({
      ...s,
      studentName: s.profiles?.name ?? "Unknown",
    }));
  });

export const reviewAssignmentSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: { submissionId: string; grade?: number | null; feedback?: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") {
      throw new Error("Unauthorized");
    }

    const { data: sub } = await db(supabase)
      .from("assignment_submissions")
      .select("student_id, class_id, class_assignments!assignment_id(title, end_at, lecturer_id)")
      .eq("id", data.submissionId)
      .single();

    if (!sub || (sub as any).class_assignments?.lecturer_id !== user.id) {
      throw new Error("Forbidden — you do not own this assignment");
    }

    // Grading is only allowed after the submission deadline.
    const endAt = (sub as any)?.class_assignments?.end_at;
    if (endAt && new Date() <= new Date(endAt)) {
      throw new Error("Grading is only available after the submission deadline");
    }

    const { error } = await db(supabase)
      .from("assignment_submissions")
      .update({
        status: "reviewed",
        grade: data.grade ?? null,
        feedback: data.feedback?.trim() || null,
      })
      .eq("id", data.submissionId);

    if (error) throw new Error(error.message);

    try {
      if (sub?.student_id) {
        const assignmentTitle = (sub as any).class_assignments?.title ?? "your assignment";
        const gradeText = data.grade != null ? ` Grade: ${data.grade} pts.` : "";
        await pushNotification(supabase, {
          userId: sub.student_id,
          type: "assignment_reviewed",
          title: "Assignment graded",
          body: `Your submission for "${assignmentTitle}" has been reviewed.${gradeText}`,
          link: `/student/classes/${sub.class_id}`,
        });
      }
    } catch {}

    return { success: true };
  });

export const getAllClassesAdmin = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const { data: classes, error } = await db(supabase)
      .from("classes")
      .select("*, profiles!lecturer_id(name)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("class_id");

    return (classes as any[]).map((c: any) => ({
      ...c,
      lecturer: c.profiles?.name || "Unknown",
      students: (enrollments as any[])?.filter((e: any) => e.class_id === c.id).length || 0,
    }));
  });

export const deleteClass = createServerFn({ method: "POST" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const { data: cls } = await db(supabase)
      .from("classes")
      .select("name, code")
      .eq("id", classId)
      .single();

    const { error } = await db(supabase).from("classes").delete().eq("id", classId);
    if (error) throw new Error(error.message);

    await writeAudit(user.id, {
      action: "Deleted class",
      target: cls ? `${cls.name} [${cls.code}]` : classId,
      category: "class",
    });

    return { success: true };
  });


