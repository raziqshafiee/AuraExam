import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

export type QuestionMCQMeta = { options: [string, string, string, string]; option_images?: [string | null, string | null, string | null, string | null]; correct: 0 | 1 | 2 | 3; image_url?: string };
export type QuestionTFMeta = { correct: boolean; image_url?: string };
export type QuestionEssayMeta = { model_answer: string; rubric: string; image_url?: string };
export type QuestionMeta = QuestionMCQMeta | QuestionTFMeta | QuestionEssayMeta;

export type Question = {
  id: string;
  type: "MCQ" | "TF" | "ESSAY";
  text: string;
  class_id: string | null;
  difficulty: "easy" | "med" | "hard";
  points: number;
  tags: string[];
  version: number;
  created_by: string | null;
  created_at: string;
  meta: QuestionMeta | null;
  classes?: { code: string; name: string } | null;
};

type QuestionInput = {
  type: "MCQ" | "TF" | "ESSAY";
  text: string;
  class_id: string;
  difficulty: "easy" | "med" | "hard";
  points: number;
  tags: string[];
  meta: QuestionMeta;
};

export const getQuestions = createServerFn({ method: "GET" })
  .handler(async (): Promise<Question[]> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await db(supabase)
      .from("questions")
      .select("*, classes(code, name)")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Question[]) || [];
  });

export const getQuestion = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<Question> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await db(supabase)
      .from("questions")
      .select("*, classes(code, name)")
      .eq("id", id)
      .eq("created_by", user.id)
      .single();

    if (error) throw new Error(error.message);
    return data as Question;
  });

export const createQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: QuestionInput) => data)
  .handler(async ({ data }): Promise<Question> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: question, error } = await db(supabase)
      .from("questions")
      .insert({
        type: data.type,
        text: data.text,
        class_id: data.class_id,
        difficulty: data.difficulty,
        points: data.points,
        tags: data.tags,
        meta: data.meta,
        version: 1,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return question as Question;
  });

export const updateQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string } & QuestionInput) => data)
  .handler(async ({ data }): Promise<Question> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: current } = await db(supabase)
      .from("questions")
      .select("version")
      .eq("id", data.id)
      .single();

    const { data: question, error } = await db(supabase)
      .from("questions")
      .update({
        type: data.type,
        text: data.text,
        class_id: data.class_id,
        difficulty: data.difficulty,
        points: data.points,
        tags: data.tags,
        meta: data.meta,
        version: ((current as any)?.version ?? 1) + 1,
      })
      .eq("id", data.id)
      .eq("created_by", user.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return question as Question;
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await db(supabase)
      .from("questions")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
