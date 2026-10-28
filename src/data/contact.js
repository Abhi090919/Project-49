/**
 * A private conversation: the quiet way in.
 *
 * The section is shown when `enabled` is true. The form itself appears once
 * there is somewhere for it to go: an `endpoint` (a form service such as
 * Formspree / Basin / your own function, which receives a JSON POST) or,
 * failing that, an `email` (the form opens the visitor's mail app with the
 * message written out). WhatsApp and phone are shown as links when set.
 *
 * Keep the tone flat: no urgency, no scarcity, none of the banned phrases in
 * command-center/brand/BRAND_BIBLE.md ("enquire now", "book now", ...).
 * Any field left empty is simply not shown.
 */
export const CONTACT = {
  enabled: true,
  eyebrow: 'Talk to us',
  line: 'Tell us about your land.',
  note: 'Where it is, how your family likes to live, and which philosophy speaks to you. We will call you back and come to see it with you.',
  name: '',
  email: '',
  endpoint: 'https://script.google.com/macros/s/AKfycbzrIS_rsEilDkJlSRT7i9Zp5ken35N_MGxaP20gkyM7GQpFW-I6U1AT3N35O0f0G4dn/exec', // Project 49 > Website Leads sheet
  whatsapp: '+91 90004 43131',
  phone: '',
  instagram: '', // handle without the @
  // Once registered, RERA requires the registration number and the authority
  // website on advertising, e.g. 'TG RERA Reg. No. ... · rera.telangana.gov.in'
  rera: '',
};

export default CONTACT;
