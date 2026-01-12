-- Find clients with email containing 'nwolfe' or 'quantum'
SELECT 
  id,
  name,
  email,
  portal_access_enabled,
  CASE 
    WHEN portal_password IS NOT NULL AND portal_password != '' 
    THEN 'Password: "' || portal_password || '"'
    ELSE '❌ NO PASSWORD'
  END as password_info
FROM clients
WHERE 
  LOWER(email) LIKE '%nwolfe%' 
  OR LOWER(email) LIKE '%quantum%'
  OR LOWER(name) LIKE '%wolfe%'
ORDER BY created_at DESC;

-- Also search by name if email doesn't match
SELECT 
  id,
  name,
  email,
  portal_access_enabled,
  CASE 
    WHEN portal_password IS NOT NULL AND portal_password != '' 
    THEN 'Password: "' || portal_password || '"'
    ELSE '❌ NO PASSWORD'
  END as password_info
FROM clients
WHERE LOWER(name) LIKE '%nicole%' OR LOWER(name) LIKE '%wolfe%'
ORDER BY created_at DESC;
