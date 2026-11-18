/* Public settings of the Supabase project (Project Settings > API Keys).
   The publishable key is meant to be public: access is protected by the row-level security rules in supabase/schema.sql. */
window.VPRONO_CONFIG = {
  supabaseUrl: "https://yxmijygaxqfmebmhnbxy.supabase.co",
  supabaseKey: "sb_publishable_aA_zTb9kx7G7l8FUsmWciQ_Cj2NAsvT",
  // Donation page (Ko-fi, Tipeee, Buy Me a Coffee, PayPal.me...). Leave empty to hide the "Soutenir Vprono" card.
  // Public key for push notifications (the private half lives in Supabase, table app_secrets)
  vapidPublicKey: "BNTjVyKcQxtxfEOH4GCGH0czOsD8gYqmTfFOa7sQq-KALEawK8o17Dsknelu58FqR3gRkibVXoNTHErhsn0alSU",
  // PayPal.me link used for Supporter purchases (cosmetic only)
  paypalMe: "https://paypal.me/CologneValentin",
  donateUrl: "https://paypal.me/CologneValentin",
};
