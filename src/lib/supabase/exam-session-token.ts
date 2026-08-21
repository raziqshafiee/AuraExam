import { SignJWT, jwtVerify } from "jose";

export interface ExamTokenPayload {
  sub: string;
  examId: string;
  submissionId: string;
}

function encodeSecret(secret: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(secret, "utf-8"));
  }
  return new TextEncoder().encode(secret);
}

export async function signExamToken(
  payload: ExamTokenPayload,
  expiresAt: Date,
  secret: string = process.env.EXAM_SESSION_SECRET ?? "",
): Promise<string> {
  return new SignJWT({ examId: payload.examId, submissionId: payload.submissionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(encodeSecret(secret));
}

export async function verifyExamToken(
  token: string,
  expected: ExamTokenPayload,
  secret: string = process.env.EXAM_SESSION_SECRET ?? "",
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret));
    return (
      payload.sub === expected.sub &&
      payload.examId === expected.examId &&
      payload.submissionId === expected.submissionId
    );
  } catch {
    return false;
  }
}
