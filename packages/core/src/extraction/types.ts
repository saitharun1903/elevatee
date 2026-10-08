import type {
  EducationRequirement,
  EmploymentType,
  ExperienceRequirement,
  ExtractionMethod,
  SalaryRange,
  WorkplaceType,
} from "../schemas/job";

/** Field values a single extraction source can contribute. */
export interface JobFields {
  title: string | null;
  company: string | null;
  companyWebsite: string | null;
  location: string | null;
  country: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  postedAt: string | null;
  validThrough: string | null;
  description: string | null;
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  benefits: string[];
  education: EducationRequirement | null;
  experience: ExperienceRequirement | null;
  salary: SalaryRange | null;
  applicationUrl: string | null;
  sourceJobId: string | null;
}

export type PartialJob = Partial<JobFields>;

export interface SourceExtraction {
  method: ExtractionMethod;
  fields: PartialJob;
  warnings: string[];
}
