/**
 * Name parsing and company cleaning utilities for outreach emails.
 * Extracts real first names from email addresses and cleans page-title cruft from company names.
 */

// Common first names dictionary for splitting concatenated email local parts
const COMMON_NAMES = new Set([
  'aaron','adam','adrian','alan','albert','alex','alexander','alfred','alice','alicia','alison','allen',
  'allison','amanda','amber','amy','andrea','andrew','andy','angela','angel','ann','anna','anne',
  'anthony','antonio','april','arthur','ashley','audrey','austin','barbara','barry','becky','ben',
  'benjamin','beth','betty','beverly','bill','billy','blake','bob','bobby','bonnie','brad','bradley',
  'brandon','brenda','brent','brett','brian','brianna','brittany','brooke','bruce','bryan','caleb',
  'calvin','cameron','carl','carla','carol','caroline','carolyn','casey','catherine','chad','charles',
  'charlie','charlotte','chase','chelsea','cheryl','chris','christian','christina','christine',
  'christopher','cindy','claire','clarence','clark','claude','corey','courtney','craig','crystal',
  'curt','curtis','cynthia','dale','dan','dana','daniel','danny','darla','darlene','darren','dave',
  'david','dawn','dean','debbie','deborah','debra','dennis','derek','derrick','diana','diane','don',
  'donald','donna','doris','dorothy','doug','douglas','drew','dustin','dylan','earl','ed','eddie',
  'edward','eileen','elaine','elizabeth','ellen','emily','emma','eric','erica','erik','erin','ernest',
  'ethan','eugene','evan','evelyn','faith','frank','fred','gabriel','gail','gary','gene','george',
  'gerald','gina','glen','glenn','gloria','grace','greg','gregory','gwen','hailey','hannah','harold',
  'harry','heather','helen','henry','holly','howard','hunter','irene','jack','jackie','jacob','james',
  'jamie','jan','jane','janet','janice','jared','jason','jay','jean','jeff','jeffrey','jen','jenna',
  'jennifer','jenny','jeremy','jerry','jesse','jessica','jill','jim','jimmy','joan','joann','joanna',
  'joe','joel','john','johnny','jon','jonathan','jordan','jose','joseph','josh','joshua','joy','joyce',
  'juan','judith','judy','julia','julian','julie','justin','kara','karen','karl','kate','katherine',
  'kathleen','kathy','katie','kayla','keith','kelly','ken','kendra','kenneth','kenny','kevin','kim',
  'kimberly','kristen','kristin','kristina','kurt','kyle','lance','larry','laura','lauren','laurie',
  'lawrence','leah','lee','leon','leonard','leslie','liam','lillian','lily','linda','lindsay','lisa',
  'logan','lois','lonnie','lori','louis','louise','lucas','luke','lynn','madison','marc','marcus',
  'margaret','maria','marie','marilyn','mario','mark','marlene','marsha','martha','martin','mary',
  'mason','matt','matthew','maureen','max','megan','melanie','melissa','michael','michele','michelle',
  'mike','miles','miranda','mitchell','molly','monica','morgan','nancy','natalie','nathan','neal',
  'neil','nicholas','nick','nicole','noah','noel','norma','norman','olivia','oscar','pam','pamela',
  'pat','patricia','patrick','patty','paul','paula','peggy','penny','perry','pete','peter','phil',
  'philip','phyllis','rachel','ralph','randy','ray','raymond','rebecca','regina','renee','rex',
  'rhonda','richard','rick','ricky','rita','rob','robert','robin','rod','rodney','roger','ron',
  'ronald','ronnie','rosa','rose','ross','roxanne','roy','russell','ruth','ryan','sabrina','sally',
  'sam','samantha','samuel','sandra','sandy','sara','sarah','scott','sean','seth','shane','shannon',
  'sharon','shawn','sheila','shelly','sherry','shirley','sophia','stacey','stacy','stanley','stella',
  'stephanie','stephen','steve','steven','sue','susan','suzanne','tamara','tammy','tanya','tara',
  'taylor','ted','teresa','terri','terry','theresa','thomas','tiffany','tim','timothy','tina','todd',
  'tom','tommy','tony','tonya','tracey','tracy','travis','trent','trevor','troy','tyler','valerie',
  'vanessa','vernon','vicki','victor','victoria','vincent','virginia','vivian','wade','walter','wanda',
  'warren','wayne','wendy','wesley','whitney','william','willie','zachary','zach',
]);

// Role-based email prefixes that aren't real names
const ROLE_PREFIXES = new Set([
  'info','admin','support','office','team','hello','contact','reception','receptionist',
  'hr','billing','sales','marketing','frontdesk','staff','help','service','services',
  'accounts','accounting','mail','webmaster','postmaster','noreply','no-reply',
  'enquiries','inquiry','inquiries','general','main','ops','operations','management',
  'careers','jobs','press','media','news','feedback','complaints','legal',
]);

// Business keywords that indicate a contact_name is actually a company name
const BUSINESS_KEYWORDS = /\b(llc|inc|corp|ltd|co|law|legal|dental|dent|chiro|chiropractic|realty|real estate|group|associates|partners|practice|clinic|center|centre|agency|firm|studio|shop|salon|spa|insurance|financial|consulting|solutions|services|properties|mgmt|management|advisors|plumbing|electric|hvac|roofing|construction|landscaping|painting|cleaning|auto|veterinary|vet|orthodont|pediatr|physical therapy|pt|med|medical|health|wellness|fitness|yoga|crossfit|barber|beauty)\b/i;

// Page-title words that indicate contact_name was scraped from a web page
const PAGE_TITLE_WORDS = /^(about|contact|home|meet|our|services|welcome|team|staff|providers|doctors|attorneys|agents|location|office|schedule|book|faq|blog|news|testimonials|reviews|gallery|portfolio|pricing|careers|jobs|login|sign|register)\b/i;

// Professional descriptors often found at end of company names
const TRAILING_DESCRIPTORS = /\s*[-–—,]\s*(chiropractor|dentist|attorney|lawyer|realtor|real estate agent|cpa|accountant|plumber|electrician|doctor|physician|therapist|counselor|consultant|advisor|broker|agent|specialist|professional|expert|contractor|orthodontist|pediatrician|veterinarian|optometrist|dermatologist|surgeon|practitioner)s?\s*$/i;

// Location suffixes like "in City, ST" or "| City, State"
const LOCATION_SUFFIX = /\s*[-–—|]\s*(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s*$/;
const LOCATION_SUFFIX_FULL = /\s*[-–—|]\s*(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+\s*$/;

/**
 * Extract a first name from an email address local part.
 * e.g., "pam.osborne@firm.com" → "Pam"
 *       "drzachhaley@gmail.com" → "Zach"
 *       "info@company.com" → null
 */
function extractFirstNameFromEmail(email) {
  if (!email || !email.includes('@')) return null;

  let local = email.split('@')[0].toLowerCase().trim();

  // Reject role-based addresses
  if (ROLE_PREFIXES.has(local)) return null;

  // Strip common prefixes like "dr", "dr."
  local = local.replace(/^dr\.?/i, '');

  // Try splitting on separators: . _ -
  if (/[._-]/.test(local)) {
    const parts = local.split(/[._-]/);
    const candidate = parts[0];
    // Reject if the first part is a role
    if (ROLE_PREFIXES.has(candidate)) return null;
    // Reject very short parts (likely initials)
    if (candidate.length < 2) return null;
    // Reject if it looks like all numbers
    if (/^\d+$/.test(candidate)) return null;
    return capitalize(candidate);
  }

  // No separator — try matching against common names dictionary
  // Check if local part starts with a known name (min 3 chars to avoid false positives)
  for (const name of COMMON_NAMES) {
    if (name.length >= 3 && local.startsWith(name) && local.length > name.length) {
      return capitalize(name);
    }
  }

  // If the whole local part is a known name, use it
  if (COMMON_NAMES.has(local) && local.length >= 3) {
    return capitalize(local);
  }

  // If local part is short-ish and looks like a name (all alpha, reasonable length)
  if (/^[a-z]{2,12}$/.test(local) && !ROLE_PREFIXES.has(local)) {
    // Could be a name, but we're not sure — only return if it's in our dictionary
    return null;
  }

  return null;
}

/**
 * Clean page-title cruft from company names.
 * e.g., "Highland Dental Center: Dentist in Salt Lake City, UT" → "Highland Dental Center"
 *       "Smith Law Firm | Attorneys - Dallas, TX" → "Smith Law Firm"
 *       "About - Johnson Chiropractic..." → "Johnson Chiropractic"
 */
function cleanCompanyName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';

  let name = rawName.trim();

  // Remove trailing ellipsis
  name = name.replace(/\.{2,}$/, '').trim();

  // Split on common page-title delimiters and take the most meaningful segment
  const delimiters = /\s*[-–—|]+\s+|\s*:\s+|\s+[-–—|:]+\s*/;
  if (delimiters.test(name)) {
    const segments = name.split(delimiters).map(s => s.trim()).filter(s => s.length > 0);

    // Filter out segments that are page-title words or location patterns
    const meaningful = segments.filter(seg =>
      !PAGE_TITLE_WORDS.test(seg) &&
      !/^(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}$/.test(seg) &&
      !/^(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+$/.test(seg)
    );

    // Take the first meaningful segment (usually the company name)
    name = meaningful.length > 0 ? meaningful[0] : segments[0];
  }

  // Remove trailing professional descriptors
  name = name.replace(TRAILING_DESCRIPTORS, '').trim();

  // Remove location suffixes
  name = name.replace(LOCATION_SUFFIX, '').trim();
  name = name.replace(LOCATION_SUFFIX_FULL, '').trim();

  // Remove trailing ellipsis again (in case it was after a delimiter)
  name = name.replace(/\.{2,}$/, '').trim();

  // If result is too short, return the original trimmed
  if (name.length < 2) return rawName.trim();

  return name;
}

/**
 * Master function: get a real first name for a lead.
 * Tries contact_name first, then falls back to email parsing.
 *
 * @param {string} contactName - The raw contact name from the database
 * @param {string} contactEmail - The contact's email address
 * @returns {string} A first name or 'there' as fallback
 */
function getFirstName(contactName, contactEmail) {
  // Check if contactName looks like a real person name
  if (contactName && typeof contactName === 'string') {
    const trimmed = contactName.trim();
    const words = trimmed.split(/\s+/);

    // Strip honorific prefixes (Dr., Mr., Mrs., Ms., Prof.)
    let nameWords = [...words];
    if (nameWords.length >= 2 && /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)$/i.test(nameWords[0])) {
      nameWords = nameWords.slice(1);
    }

    const isRealName =
      nameWords.length >= 1 &&
      words.length >= 2 && // original must have 2+ words
      /^[A-Z]/.test(nameWords[0]) &&
      !BUSINESS_KEYWORDS.test(trimmed) &&
      !PAGE_TITLE_WORDS.test(trimmed) &&
      // Not a URL or domain pattern
      !/\.(com|net|org|io|co|us|biz)$/i.test(trimmed) &&
      // Not a single word repeated or very long (likely a business name scraped from page)
      nameWords[0].length <= 15 &&
      // First word should look like a name (alpha only, reasonable length)
      /^[A-Za-z'-]+$/.test(nameWords[0]) &&
      nameWords[0].length >= 2;

    if (isRealName) {
      return nameWords[0];
    }

    // Single-word name — only if it's in our common names dictionary
    if (words.length === 1 && COMMON_NAMES.has(words[0].toLowerCase()) && !PAGE_TITLE_WORDS.test(words[0])) {
      return capitalize(words[0]);
    }
  }

  // Fall back to email extraction
  const fromEmail = extractFirstNameFromEmail(contactEmail);
  if (fromEmail) return fromEmail;

  // Final fallback
  return 'there';
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = { extractFirstNameFromEmail, cleanCompanyName, getFirstName };
