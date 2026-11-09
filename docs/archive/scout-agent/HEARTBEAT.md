# Scout Heartbeat Tasks

Check these on each heartbeat (every 30 min during business hours):

## 1. Follow-ups Due
Query Supabase `sdr_followups_due` view and send appropriate follow-up emails.

## 2. New Webhook Replies
Check if any new Bison webhooks came in that weren't processed.

## 3. Check for Prospect Replies  
Look for replies from prospects in active sequences - if they replied, stop the sequence.
