def gain(s) =
  amplify(0.8,
end

def tagged(s) =
  s = gain(s)
  metadata.map(fun (m) -> [("station", "demo")], s)
end

music = sine()
radio = tagged(music)
output.dummy(radio)
