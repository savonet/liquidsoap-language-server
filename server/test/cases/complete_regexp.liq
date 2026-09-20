def parse_file(s) =
  x = r/^FILE (.+)$/.
  matches = r/^FILE (.+)$/.exec(string.trim(s))
  (x, matches)
end
ignore(parse_file)

#? complete 2:21
#? complete 3:27
