# Liquidsoap accepts a trailing comma in a record type, tree-sitter does not.
let json.parse (config:{
  name:string,
  port:int?,
}) = "{}"
print(config.name)
#? hover 6:13
