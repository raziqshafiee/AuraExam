import { SignJWT, jwtVerify } from "jose";

export interface ExamTokenPayload {
  sub: string;
  examId: string;
  submissionId: string;
}

/** HS256 needs a key at least as long as its digest. */
const MIN_SECRET_BYTES = 32;

// jose throws an opaque "DataError: Zero-length key is not supported" when the
// secret is missing, which surfaces to the student as a generic server error
// during check-in. Fail loudly and specifically instead — and never let a
// short (guessable) secret sign a token that gates exam entry.
function encodeSecret(secret: string): Uint8Array {
  const bytes = new TextEncoder().encode(secret ?? "");
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `EXAM_SESSION_SECRET must be set to a non-empty string of at least ${MIN_SECRET_BYTES} characters (got ${bytes.length}).`,
    );
  }
  return bytes;
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
  // Deliberately outside the try: a misconfigured secret is an operator error,
  // not an invalid token, and must not be swallowed into a silent `false`.
  const key = encodeSecret(secret);
  try {
    const { payload } = await jwtVerify(token, key);
    return (
      payload.sub === expected.sub &&
      payload.examId === expected.examId &&
      payload.submissionId === expected.submissionId
    );
  } catch {
    return false;
  }
}
