# Release construction

The release branch starts from main's committed decision routing changes and
receives only the reviewed agent metadata/cache task. Version bookkeeping changes
the project, package and root lock record to 0.1.9; dependency records remain
identical. Release notes and task/spec closure are separate from product source.

The primary index contains seven unrelated staged paths. Reconstruct it against
each fast-forwarded release commit by replaying only that retained patch. Never
stash, reset or include those paths in the release. Use the existing tag workflow
and installed smoke, retain native failures and source-bound receipts outside Git.
The release tag remains immutable when post-publication closure is committed.
