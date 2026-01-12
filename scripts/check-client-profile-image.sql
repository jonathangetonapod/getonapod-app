-- Check if Norman Wolfe has a profile image URL
SELECT 
  id,
  name,
  email,
  avatar_url,
  profile_image_url,
  linkedin_url,
  headshot_url
FROM clients
WHERE email = 'nwolfe@quantumleaders.com';
