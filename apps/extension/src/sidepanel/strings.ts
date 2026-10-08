/**
 * Every user-facing string in the side panel. English only for now; keep copy here so the panel
 * can be localized without touching rendering code. Functions are used for interpolation.
 */
export const strings = {
  brand: "Elevate",
  tagline: "Know the job before you apply.",

  // Account
  connect: "Connect Elevate",
  connectLead: "Connect your Elevate account to analyze jobs. You'll sign in on the Elevate website.",
  connectAfterExpiry: "Your Elevate session ended. Connect again to continue.",
  signedInAs: (email: string) => `Signed in as ${email}`,
  signedIn: "Signed in",
  signOut: "Sign out",

  // Access
  checking: "Checking this tab…",
  readingPage: "Reading this page…",
  noGrantTitle: "Elevate can't read this tab yet",
  noGrantBody: "Click the Elevate icon on the job page to let Elevate read it.",
  noGrantWhy: "Elevate only reads a page after you click its icon on that page. It never watches your browsing.",
  unreadableTitle: "This page can't be read",
  unreadableBody: {
    browser_page: "Browser pages can't be read by extensions. Open a job posting and click the Elevate icon there.",
    store_page: "Extension store pages can't be read by extensions. Open a job posting and click the Elevate icon there.",
    pdf_viewer: "Job descriptions shown in the PDF viewer can't be read. Open the posting's web page, or paste the text into Elevate.",
    not_http: "Only web pages (http/https) can be read. Open a job posting and click the Elevate icon there.",
    unknown: "Click the Elevate icon on the job page to let Elevate read it.",
  } as Record<string, string>,
  captureFailed: "Elevate couldn't read this page.",

  // Preview
  detectedOn: (platform: string) => `Detected on ${platform}`,
  confidence: { high: "Structured job data found", medium: "Recognized job page", low: "Possible job page" } as Record<string, string>,
  untitledRole: "Untitled role",
  companyUnknown: "Company not shown",
  analyze: "Analyze This Job",
  analyzeAnyway: "Analyze anyway",
  notJobTitle: "This doesn't look like a job posting",
  notJobBody: "If it is one, select the job description text on the page and click Analyze anyway.",
  selectionInUse: (n: number) => `Your selected text (${n.toLocaleString()} characters) will be used as the description.`,
  selectionTooShort: "Selected text is too short to be used as the description (200 characters minimum).",
  privacyNote: "Elevate sends this page to your account only when you click Analyze.",
  connectToAnalyze: "Connect Elevate to analyze this job.",

  // Submitting / progress
  sending: "Sending the page to Elevate…",
  deduplicated: "Already analyzed — opening saved analysis",
  waitingForServer: "Waiting for Elevate to start…",
  analyzing: "Analyzing",
  liveVia: { stream: "Live", poll: "Checking every few seconds" } as Record<string, string>,
  stageLabels: {
    extraction: "Reading job",
    classification: "Understanding role",
    requirements: "Extracting requirements",
    research: "Researching evidence",
    candidate: "Comparing profile",
    ats: "Estimating ATS compatibility",
    fit: "Calculating fit",
  } as Record<string, string>,
  outcomeLabels: {
    pending: "Waiting",
    running: "In progress",
    completed: "Done",
    skipped: "Skipped",
    unavailable: "Unavailable",
    failed: "Failed",
    timeout: "Timed out",
  } as Record<string, string>,
  loadingResult: "Loading results…",

  // Not a job (server)
  notAJobServerTitle: "No job found on this page",
  notAJobHint: "Select the job description text on the page (at least a few paragraphs), then click Retry.",

  // Results
  recommendation: "Recommendation",
  recommendationLabels: {
    strong: "Strong match",
    worth_applying: "Worth applying",
    significant_gaps: "Significant gaps",
  } as Record<string, string>,
  recommendationUnavailable: "Not enough evidence for a recommendation",
  addResume: "Add your resume to see your match",
  addResumeLink: "Add resume",
  fit: "Fit",
  ats: "ATS",
  scoreMissing: "—",
  estimate: "estimate",
  topMatch: "Top match",
  topGap: "Top gap",
  partialMatch: "Partial match",
  noMatches: "No requirement matches yet.",
  required: "Required",
  preferred: "Preferred",
  fromResume: "From your resume",
  process: "Process",
  processCompany: "Reported for this company",
  processSimilar: "Reported for similar roles",
  processPredicted: "Predicted by Elevate",
  steps: (n: number) => (n === 1 ? "1 step" : `${n} steps`),
  questions: "Questions",
  questionsCount: (shown: number, total: number) => (total > shown ? `${shown} of ${total}` : String(shown)),
  noQuestions: "No interview questions yet.",
  originLabels: { reported: "Reported", similar: "Similar", predicted: "Predicted" } as Record<string, string>,
  evidenceLabels: {
    verified: "Verified",
    source_backed: "Source-backed",
    candidate_reported: "Candidate-reported",
    inferred: "Inferred",
    predicted: "Predicted",
  } as Record<string, string>,
  openFull: "Open Full Analysis",
  statusPartial: "Some parts of this analysis couldn't be completed.",
  statusFailed: "The analysis didn't finish.",
  statusTimeout: "The analysis timed out on the server.",
  analyzeAgain: "Analyze again",
  incompleteStages: "Incomplete stages",

  // Errors
  retry: "Retry",
  genericError: "Something went wrong.",
  panelTimeout: "This is taking too long. Try again.",
  workplace: { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" } as Record<string, string>,

  platforms: {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    glassdoor: "Glassdoor",
    wellfound: "Wellfound",
    internshala: "Internshala",
    dice: "Dice",
    ziprecruiter: "ZipRecruiter",
    monster: "Monster",
    greenhouse: "Greenhouse",
    lever: "Lever",
    workday: "Workday",
    smartrecruiters: "SmartRecruiters",
    ashby: "Ashby",
    company_site: "company site",
    manual: "manual entry",
  } as Record<string, string>,
} as const;

export type Strings = typeof strings;
