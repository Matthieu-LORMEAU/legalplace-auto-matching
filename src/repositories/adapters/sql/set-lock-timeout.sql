-- $1: how long a statement may wait for a lock (for example '5s'). Local to the current transaction.
select set_config('lock_timeout', $1, true);