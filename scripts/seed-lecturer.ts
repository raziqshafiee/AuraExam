import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// ──────────────────────────────────────────────
// Classes
// ──────────────────────────────────────────────
const CLASSES = [
  { code: "MAT301", name: "Calculus & Linear Algebra", color: "#a3e635" },
  { code: "CSC201", name: "Data Structures & Algorithms", color: "#f0abfc" },
  { code: "DBS401", name: "Database Systems", color: "#7dd3fc" },
];

// ──────────────────────────────────────────────
// Questions per class (10 MCQ, 5 TF, 5 ESSAY)
// ──────────────────────────────────────────────
type QuestionRow = {
  type: "MCQ" | "TF" | "ESSAY";
  text: string;
  difficulty: "easy" | "med" | "hard";
  points: number;
  tags: string[];
  meta: Record<string, unknown>;
};

const QUESTIONS: Record<string, QuestionRow[]> = {
  MAT301: [
    // MCQ ×10
    {
      type: "MCQ",
      text: "What is the derivative of f(x) = x³ + 2x² − 5x + 1?",
      difficulty: "easy",
      points: 2,
      tags: ["differentiation", "polynomials"],
      meta: {
        options: ["3x² + 4x − 5", "3x² − 4x + 5", "x² + 4x − 5", "3x + 4"],
        correct: 0,
      },
    },
    {
      type: "MCQ",
      text: "Which rule is used to differentiate a product of two functions?",
      difficulty: "easy",
      points: 2,
      tags: ["differentiation", "rules"],
      meta: {
        options: ["Chain rule", "Quotient rule", "Product rule", "L'Hôpital's rule"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "Evaluate: ∫₀¹ (2x + 3) dx",
      difficulty: "easy",
      points: 3,
      tags: ["integration", "definite"],
      meta: {
        options: ["4", "5", "3", "6"],
        correct: 0,
      },
    },
    {
      type: "MCQ",
      text: "What is the determinant of matrix A = [[2, 1], [3, 4]]?",
      difficulty: "easy",
      points: 2,
      tags: ["linear-algebra", "determinant"],
      meta: {
        options: ["5", "8", "11", "−5"],
        correct: 0,
      },
    },
    {
      type: "MCQ",
      text: "Which of the following is the correct formula for integration by parts?",
      difficulty: "med",
      points: 3,
      tags: ["integration", "by-parts"],
      meta: {
        options: [
          "∫u dv = uv − ∫v du",
          "∫u dv = uv + ∫v du",
          "∫u dv = u dv − v du",
          "∫u dv = ∫v du − uv",
        ],
        correct: 0,
      },
    },
    {
      type: "MCQ",
      text: "What is the limit of sin(x)/x as x → 0?",
      difficulty: "med",
      points: 3,
      tags: ["limits", "trigonometry"],
      meta: {
        options: ["0", "∞", "1", "undefined"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "If A is a 3×3 matrix and det(A) = 0, what can be concluded?",
      difficulty: "med",
      points: 3,
      tags: ["linear-algebra", "determinant"],
      meta: {
        options: [
          "A is invertible",
          "A is singular (not invertible)",
          "A has all zero entries",
          "A is symmetric",
        ],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "What is the eigenvalue of the identity matrix I (any size)?",
      difficulty: "med",
      points: 3,
      tags: ["eigenvalues", "linear-algebra"],
      meta: {
        options: ["0", "−1", "1", "Depends on size"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "Using L'Hôpital's rule, evaluate lim(x→0) (e^x − 1) / x.",
      difficulty: "hard",
      points: 5,
      tags: ["limits", "lhopital"],
      meta: {
        options: ["0", "e", "1", "∞"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "What is the general solution of the differential equation dy/dx = y?",
      difficulty: "hard",
      points: 5,
      tags: ["differential-equations"],
      meta: {
        options: ["y = Ce^x", "y = Ce^(−x)", "y = Cx", "y = C ln x"],
        correct: 0,
      },
    },
    // TF ×5
    {
      type: "TF",
      text: "The integral of a constant c with respect to x equals cx.",
      difficulty: "easy",
      points: 1,
      tags: ["integration"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "Every square matrix has an inverse.",
      difficulty: "easy",
      points: 1,
      tags: ["linear-algebra"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "The derivative of a constant is zero.",
      difficulty: "easy",
      points: 1,
      tags: ["differentiation"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "A matrix multiplied by its inverse always equals the zero matrix.",
      difficulty: "med",
      points: 2,
      tags: ["linear-algebra"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "The definite integral ∫ₐᵇ f(x)dx represents the net signed area between f(x) and the x-axis.",
      difficulty: "med",
      points: 2,
      tags: ["integration", "definite"],
      meta: { correct: true },
    },
    // ESSAY ×5
    {
      type: "ESSAY",
      text: "Explain the Fundamental Theorem of Calculus and how its two parts relate differentiation to integration.",
      difficulty: "hard",
      points: 10,
      tags: ["integration", "theory"],
      meta: {
        model_answer:
          "Part 1: if F(x) = ∫ₐˣ f(t)dt then F'(x) = f(x). Part 2: ∫ₐᵇ f(x)dx = F(b) − F(a) where F is any antiderivative of f. Together they show differentiation and integration are inverse operations.",
        rubric:
          "2pts – states Part 1 correctly; 2pts – states Part 2 correctly; 3pts – explains inverse relationship; 3pts – gives a correct worked example.",
      },
    },
    {
      type: "ESSAY",
      text: "Describe the process of Gaussian elimination and demonstrate it on the system: 2x + y = 5, x − y = 1.",
      difficulty: "med",
      points: 8,
      tags: ["linear-algebra", "systems"],
      meta: {
        model_answer:
          "Gaussian elimination reduces the augmented matrix to row echelon form using elementary row operations. For the given system: [2 1 | 5; 1 -1 | 1]. R2 ← R2 − ½R1 gives [2 1 | 5; 0 -3/2 | -3/2]. Back-substitution: y = 1, x = 2.",
        rubric:
          "2pts – explains row operations; 3pts – correct elimination steps; 3pts – correct solution x=2, y=1.",
      },
    },
    {
      type: "ESSAY",
      text: "What is a Taylor series? Write the Taylor series expansion of e^x around x = 0 and explain its convergence.",
      difficulty: "hard",
      points: 10,
      tags: ["series", "taylor"],
      meta: {
        model_answer:
          "A Taylor series represents a function as an infinite sum of its derivatives at a point. e^x = Σ(n=0 to ∞) x^n/n! = 1 + x + x²/2! + x³/3! + ... It converges for all real x (radius of convergence = ∞) by the ratio test.",
        rubric:
          "2pts – definition of Taylor series; 3pts – correct series for e^x; 3pts – ratio test applied; 2pts – states convergence for all x.",
      },
    },
    {
      type: "ESSAY",
      text: "Explain eigenvectors and eigenvalues. Find the eigenvalues of A = [[3, 1], [0, 2]].",
      difficulty: "hard",
      points: 10,
      tags: ["eigenvalues", "eigenvectors"],
      meta: {
        model_answer:
          "An eigenvector v of matrix A satisfies Av = λv where λ is the eigenvalue. Find λ by solving det(A − λI) = 0. For the given matrix: det([[3-λ, 1],[0, 2-λ]]) = (3-λ)(2-λ) = 0, so λ = 3 and λ = 2.",
        rubric:
          "2pts – correct definition; 2pts – characteristic equation setup; 3pts – correct computation; 3pts – correct eigenvalues λ=2 and λ=3.",
      },
    },
    {
      type: "ESSAY",
      text: "Describe three real-world applications of linear algebra in computer science or engineering.",
      difficulty: "med",
      points: 6,
      tags: ["linear-algebra", "applications"],
      meta: {
        model_answer:
          "1. Computer graphics: transformation matrices for rotation, scaling, translation of 3D objects. 2. Machine learning: principal component analysis (PCA) uses eigenvectors for dimensionality reduction. 3. Network analysis: adjacency matrices represent graphs; eigenvalues reveal connectivity properties.",
        rubric:
          "2pts per application (correct domain + explanation of linear algebra used). Up to 6pts total.",
      },
    },
  ],

  CSC201: [
    // MCQ ×10
    {
      type: "MCQ",
      text: "What is the time complexity of searching in a balanced Binary Search Tree (BST)?",
      difficulty: "easy",
      points: 2,
      tags: ["bst", "complexity"],
      meta: {
        options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "Which data structure follows the LIFO (Last In, First Out) principle?",
      difficulty: "easy",
      points: 2,
      tags: ["stack", "data-structures"],
      meta: {
        options: ["Queue", "Stack", "Linked List", "Tree"],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "What is the worst-case time complexity of QuickSort?",
      difficulty: "med",
      points: 3,
      tags: ["sorting", "quicksort"],
      meta: {
        options: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "In Big-O notation, which of the following represents the fastest growth rate?",
      difficulty: "easy",
      points: 2,
      tags: ["complexity", "big-o"],
      meta: {
        options: ["O(n²)", "O(n log n)", "O(2ⁿ)", "O(n!)"],
        correct: 3,
      },
    },
    {
      type: "MCQ",
      text: "Which traversal of a BST visits nodes in sorted (ascending) order?",
      difficulty: "easy",
      points: 2,
      tags: ["bst", "traversal"],
      meta: {
        options: ["Pre-order", "Post-order", "In-order", "Level-order"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "A hash table with chaining resolves collisions by:",
      difficulty: "med",
      points: 3,
      tags: ["hash-table", "collision"],
      meta: {
        options: [
          "Finding the next empty slot",
          "Storing multiple entries per bucket using a linked list",
          "Rehashing with a secondary function",
          "Doubling the table size",
        ],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "Which algorithm is used in Dijkstra's shortest path and relies on a priority queue?",
      difficulty: "med",
      points: 3,
      tags: ["graphs", "dijkstra"],
      meta: {
        options: ["DFS", "BFS", "Greedy with min-heap", "Dynamic programming"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "What does a Red-Black Tree guarantee during insertion and deletion?",
      difficulty: "hard",
      points: 5,
      tags: ["red-black-tree", "balancing"],
      meta: {
        options: [
          "O(1) amortized operations",
          "O(log n) height at all times",
          "Sorted order without traversal",
          "O(n) space usage",
        ],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "Which of the following sorting algorithms is stable and has O(n log n) worst-case?",
      difficulty: "med",
      points: 3,
      tags: ["sorting", "merge-sort"],
      meta: {
        options: ["QuickSort", "HeapSort", "MergeSort", "SelectionSort"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "In dynamic programming, overlapping subproblems means:",
      difficulty: "hard",
      points: 5,
      tags: ["dynamic-programming"],
      meta: {
        options: [
          "The same subproblem is solved multiple times",
          "Subproblems share no common input",
          "Problems grow exponentially",
          "Recursion depth exceeds stack size",
        ],
        correct: 0,
      },
    },
    // TF ×5
    {
      type: "TF",
      text: "A queue operates on FIFO (First In, First Out) principle.",
      difficulty: "easy",
      points: 1,
      tags: ["queue"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "Binary search can be applied to an unsorted array.",
      difficulty: "easy",
      points: 1,
      tags: ["searching"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "Depth-First Search (DFS) uses a queue as its primary data structure.",
      difficulty: "med",
      points: 2,
      tags: ["graphs", "dfs"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "The space complexity of MergeSort is O(n).",
      difficulty: "med",
      points: 2,
      tags: ["sorting", "space-complexity"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "A complete binary tree with n nodes has height ⌊log₂ n⌋.",
      difficulty: "hard",
      points: 3,
      tags: ["trees", "height"],
      meta: { correct: true },
    },
    // ESSAY ×5
    {
      type: "ESSAY",
      text: "Compare and contrast BFS and DFS graph traversal algorithms. When would you use each?",
      difficulty: "med",
      points: 8,
      tags: ["graphs", "bfs", "dfs"],
      meta: {
        model_answer:
          "BFS uses a queue and explores level by level; guarantees shortest path in unweighted graphs. DFS uses a stack (or recursion) and goes deep before backtracking; useful for cycle detection, topological sort, connected components. Use BFS for shortest paths, use DFS when exploring all paths or detecting cycles.",
        rubric:
          "2pts – BFS description; 2pts – DFS description; 2pts – time/space complexity; 2pts – appropriate use-cases.",
      },
    },
    {
      type: "ESSAY",
      text: "Explain how a min-heap works and describe the heapify process for insertion and deletion.",
      difficulty: "hard",
      points: 10,
      tags: ["heap", "priority-queue"],
      meta: {
        model_answer:
          "A min-heap is a complete binary tree where every node ≤ its children. Insert: add at end, bubble-up (swap with parent while smaller). Delete-min: remove root, move last element to root, bubble-down (swap with smaller child until heap property restored). Both operations are O(log n).",
        rubric:
          "2pts – heap property definition; 3pts – insertion with bubble-up; 3pts – delete-min with bubble-down; 2pts – O(log n) justification.",
      },
    },
    {
      type: "ESSAY",
      text: "Describe the divide-and-conquer strategy. Use MergeSort as an example to explain the recurrence relation and solve it.",
      difficulty: "hard",
      points: 10,
      tags: ["divide-conquer", "mergesort"],
      meta: {
        model_answer:
          "Divide-and-conquer splits the problem, solves subproblems recursively, then combines results. MergeSort: divide array in half → sort each half → merge. Recurrence: T(n) = 2T(n/2) + O(n). By Master Theorem (case 2): T(n) = O(n log n).",
        rubric:
          "2pts – divide-and-conquer definition; 2pts – MergeSort steps; 3pts – correct recurrence; 3pts – Master Theorem application and result.",
      },
    },
    {
      type: "ESSAY",
      text: "What is a hash function? Discuss the properties of a good hash function and two collision resolution strategies.",
      difficulty: "med",
      points: 8,
      tags: ["hash-table", "collision"],
      meta: {
        model_answer:
          "A hash function maps keys to array indices. Good properties: deterministic, uniform distribution, fast computation. Collision strategies: (1) Chaining – each slot holds a linked list of entries; average O(1) with good load factor. (2) Open addressing (linear probing) – probe next slots until empty; risk of clustering.",
        rubric:
          "2pts – hash function definition; 2pts – three good properties; 2pts – chaining explained; 2pts – open addressing explained.",
      },
    },
    {
      type: "ESSAY",
      text: "Explain dynamic programming with the Fibonacci sequence. Compare the naive recursive approach with memoization in terms of time complexity.",
      difficulty: "med",
      points: 6,
      tags: ["dynamic-programming", "fibonacci"],
      meta: {
        model_answer:
          "Naive recursion recomputes subproblems: T(n) = O(2ⁿ). Memoization stores computed results so each subproblem is solved once: T(n) = O(n). This is the key DP insight — trading space for time by caching overlapping subproblem solutions.",
        rubric:
          "1pt – naive recursion tree; 2pts – memoization explanation; 2pts – O(2ⁿ) vs O(n) comparison; 1pt – correct conclusion.",
      },
    },
  ],

  DBS401: [
    // MCQ ×10
    {
      type: "MCQ",
      text: "Which SQL clause filters rows after grouping?",
      difficulty: "easy",
      points: 2,
      tags: ["sql", "groupby"],
      meta: {
        options: ["WHERE", "HAVING", "ORDER BY", "FILTER"],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "What does ACID stand for in database transactions?",
      difficulty: "easy",
      points: 2,
      tags: ["transactions", "acid"],
      meta: {
        options: [
          "Atomicity, Consistency, Isolation, Durability",
          "Accuracy, Consistency, Integrity, Durability",
          "Atomicity, Concurrency, Isolation, Data-integrity",
          "Accuracy, Concurrency, Integrity, Dependency",
        ],
        correct: 0,
      },
    },
    {
      type: "MCQ",
      text: "In the Entity-Relationship model, a diamond shape represents:",
      difficulty: "easy",
      points: 2,
      tags: ["er-model"],
      meta: {
        options: ["Entity", "Attribute", "Relationship", "Key"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "Which normal form eliminates partial dependencies?",
      difficulty: "med",
      points: 3,
      tags: ["normalization", "2nf"],
      meta: {
        options: ["1NF", "2NF", "3NF", "BCNF"],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "Which SQL JOIN returns all rows from the left table and matched rows from the right?",
      difficulty: "easy",
      points: 2,
      tags: ["sql", "joins"],
      meta: {
        options: ["INNER JOIN", "RIGHT JOIN", "LEFT JOIN", "FULL OUTER JOIN"],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "A foreign key constraint enforces:",
      difficulty: "med",
      points: 3,
      tags: ["constraints", "referential-integrity"],
      meta: {
        options: [
          "Entity integrity",
          "Referential integrity",
          "Domain integrity",
          "User-defined integrity",
        ],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "Which isolation level prevents dirty reads but allows non-repeatable reads?",
      difficulty: "hard",
      points: 5,
      tags: ["transactions", "isolation"],
      meta: {
        options: [
          "READ UNCOMMITTED",
          "READ COMMITTED",
          "REPEATABLE READ",
          "SERIALIZABLE",
        ],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "An index on a column in SQL primarily improves:",
      difficulty: "med",
      points: 3,
      tags: ["indexing", "performance"],
      meta: {
        options: [
          "INSERT speed",
          "UPDATE speed",
          "SELECT query speed",
          "DELETE speed",
        ],
        correct: 2,
      },
    },
    {
      type: "MCQ",
      text: "Which relational algebra operation is equivalent to the SQL WHERE clause?",
      difficulty: "med",
      points: 3,
      tags: ["relational-algebra"],
      meta: {
        options: ["Projection (π)", "Selection (σ)", "Rename (ρ)", "Union (∪)"],
        correct: 1,
      },
    },
    {
      type: "MCQ",
      text: "What problem does 3NF specifically solve that 2NF does not?",
      difficulty: "hard",
      points: 5,
      tags: ["normalization", "3nf"],
      meta: {
        options: [
          "Partial dependencies",
          "Multi-valued dependencies",
          "Transitive dependencies",
          "Functional dependencies",
        ],
        correct: 2,
      },
    },
    // TF ×5
    {
      type: "TF",
      text: "A primary key can contain NULL values.",
      difficulty: "easy",
      points: 1,
      tags: ["constraints", "primary-key"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "The SQL DISTINCT keyword eliminates duplicate rows from a query result.",
      difficulty: "easy",
      points: 1,
      tags: ["sql"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "Denormalization always improves database performance.",
      difficulty: "med",
      points: 2,
      tags: ["normalization", "performance"],
      meta: { correct: false },
    },
    {
      type: "TF",
      text: "A transaction that fails must be rolled back to maintain atomicity.",
      difficulty: "med",
      points: 2,
      tags: ["transactions", "acid"],
      meta: { correct: true },
    },
    {
      type: "TF",
      text: "In a B-Tree index, all data is stored only in leaf nodes.",
      difficulty: "hard",
      points: 3,
      tags: ["indexing", "b-tree"],
      meta: { correct: false },
    },
    // ESSAY ×5
    {
      type: "ESSAY",
      text: "Explain the four ACID properties of database transactions and why each is important.",
      difficulty: "med",
      points: 8,
      tags: ["transactions", "acid"],
      meta: {
        model_answer:
          "Atomicity: all operations in a transaction succeed or all are rolled back. Consistency: transaction brings DB from valid state to valid state (constraints preserved). Isolation: concurrent transactions behave as if serial. Durability: once committed, changes persist even after crashes (WAL / redo logs).",
        rubric:
          "2pts – Atomicity with example; 2pts – Consistency; 2pts – Isolation; 2pts – Durability and how it is achieved.",
      },
    },
    {
      type: "ESSAY",
      text: "What is normalization? Walk through 1NF, 2NF, and 3NF with a concrete example.",
      difficulty: "hard",
      points: 10,
      tags: ["normalization"],
      meta: {
        model_answer:
          "Normalization organizes tables to reduce redundancy. 1NF: atomic values, no repeating groups. 2NF: 1NF + no partial dependency on composite key. 3NF: 2NF + no transitive dependency. Example: StudentCourse(StudentID, CourseID, StudentName, CourseName). 1NF already satisfied. 2NF: split to Student(StudentID, StudentName) and Course(CourseID, CourseName) and Enrollment(StudentID, CourseID). 3NF: check no non-key attribute depends on another non-key attribute.",
        rubric:
          "2pts – 1NF definition + example; 3pts – 2NF with partial dependency removal; 3pts – 3NF with transitive dependency removal; 2pts – clear before/after tables.",
      },
    },
    {
      type: "ESSAY",
      text: "Compare relational databases with NoSQL databases. In what scenarios would you choose each?",
      difficulty: "med",
      points: 8,
      tags: ["nosql", "relational"],
      meta: {
        model_answer:
          "Relational DBs (RDBMS): structured schema, ACID transactions, SQL, suitable for financial systems, ERP. NoSQL: schema-less, horizontal scaling, eventual consistency, suited for social media, real-time analytics, document/graph data. Choose RDBMS when data relationships and integrity matter; choose NoSQL for high-volume unstructured data with flexible schema needs.",
        rubric:
          "2pts – RDBMS characteristics; 2pts – NoSQL types (document, key-value, graph); 2pts – RDBMS use cases; 2pts – NoSQL use cases.",
      },
    },
    {
      type: "ESSAY",
      text: "Explain SQL indexes: how they work internally (B-Tree), when to add them, and what trade-offs they introduce.",
      difficulty: "hard",
      points: 10,
      tags: ["indexing", "b-tree", "performance"],
      meta: {
        model_answer:
          "A B-Tree index maintains a sorted tree structure on the indexed column, enabling O(log n) lookups instead of O(n) full table scans. Add indexes on frequently queried columns (WHERE, JOIN, ORDER BY). Trade-offs: indexes slow down INSERT/UPDATE/DELETE (index must be maintained) and consume extra disk space. Avoid indexing low-cardinality columns (e.g., boolean).",
        rubric:
          "3pts – B-Tree structure explanation; 2pts – when to add index; 3pts – write overhead trade-off; 2pts – low-cardinality concern.",
      },
    },
    {
      type: "ESSAY",
      text: "What is the difference between optimistic and pessimistic concurrency control? Give an example of when each is appropriate.",
      difficulty: "hard",
      points: 10,
      tags: ["concurrency", "transactions"],
      meta: {
        model_answer:
          "Pessimistic: lock resources before accessing to prevent conflicts; good when contention is high (e.g., bank transfers). Optimistic: proceed without locking, validate at commit time and rollback if conflict detected (version numbers); good when contention is low (e.g., user profile updates). Pessimistic has higher overhead but fewer retries; optimistic has lower overhead but can waste work on conflict.",
        rubric:
          "2pts – pessimistic definition + locking mechanism; 2pts – optimistic definition + version check; 3pts – correct use-case for each; 3pts – trade-off discussion.",
      },
    },
  ],
};

async function seed() {
  // ── 0. Ensure meta column exists ─────────────────────────────
  await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS meta jsonb;`);
  console.log(`✓  Ensured questions.meta column exists`);

  // ── 1. Find lecturer by name ──────────────────────────────────
  const { rows: profiles } = await pool.query(
    `SELECT id FROM profiles WHERE LOWER(name) = LOWER($1) AND role = 'lecturer' LIMIT 1`,
    ["RAZIQ SHAFIEE"]
  );

  let lecturerId: string | undefined;

  if (profiles.length > 0) {
    lecturerId = profiles[0].id;
  } else {
    // Fallback: try by email
    const { rows: byEmail } = await pool.query(
      `SELECT p.id FROM profiles p JOIN auth.users u ON u.id = p.id WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
      ["raziqhacep12@gmail.com"]
    );
    if (byEmail.length === 0) {
      console.error("✗  No lecturer found with name 'RAZIQ SHAFIEE' or email 'raziqhacep12@gmail.com'.");
      console.error("   Make sure the account exists and has role = 'lecturer'.");
      process.exit(1);
    }
    lecturerId = byEmail[0].id;
  }

  console.log(`✓  Found lecturer (id: ${lecturerId})`);

  // ── 2. Upsert classes ─────────────────────────────────────────
  const classIds: Record<string, string> = {};

  for (const cls of CLASSES) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM classes WHERE code = $1 AND lecturer_id = $2 LIMIT 1`,
      [cls.code, lecturerId]
    );

    if (existing.length > 0) {
      classIds[cls.code] = existing[0].id;
      console.log(`↑  Class already exists: ${cls.code} (id: ${existing[0].id})`);
    } else {
      const { rows } = await pool.query(
        `INSERT INTO classes (code, name, color, lecturer_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [cls.code, cls.name, cls.color, lecturerId]
      );
      classIds[cls.code] = rows[0].id;
      console.log(`✓  Created class: ${cls.code} — ${cls.name} (id: ${rows[0].id})`);
    }
  }

  // ── 3. Insert questions ───────────────────────────────────────
  let totalInserted = 0;

  for (const [code, questions] of Object.entries(QUESTIONS)) {
    const classId = classIds[code];
    let classInserted = 0;

    for (const q of questions) {
      // Skip duplicates
      const { rows: dup } = await pool.query(
        `SELECT id FROM questions WHERE class_id = $1 AND created_by = $2 AND text = $3 LIMIT 1`,
        [classId, lecturerId, q.text]
      );
      if (dup.length > 0) {
        console.log(`  → Skipping duplicate: "${q.text.slice(0, 60)}…"`);
        continue;
      }

      await pool.query(
        `INSERT INTO questions (type, text, class_id, difficulty, points, tags, meta, version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 1, $8)`,
        [q.type, q.text, classId, q.difficulty, q.points, q.tags, JSON.stringify(q.meta), lecturerId]
      );
      classInserted++;
    }

    totalInserted += classInserted;
    console.log(`✓  Inserted ${classInserted} questions for ${code}`);
  }

  console.log(`\nDone! ${totalInserted} questions seeded across ${CLASSES.length} classes.`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
