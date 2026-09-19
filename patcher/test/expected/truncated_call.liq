def gain(s) = 💣() end

def tagged(s) =
  s = gain(s)
  metadata.map(fun (m) -> [("station", "demo")], s)
end

music = sine()
radio = tagged(music)
output.dummy(radio)
