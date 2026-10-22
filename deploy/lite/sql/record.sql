-- Appended to each migration file in the same transaction. psql variables: uroki_mig, uroki_sha.
insert into uroki_meta.migrations (name, sha256) values (:'uroki_mig', :'uroki_sha');
