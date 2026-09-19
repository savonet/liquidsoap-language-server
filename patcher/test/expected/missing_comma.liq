def gain(s) =
  amplify(0.8, s)
end

def tagged(s) =
  s = gain(s)
  💣()
end

music = sine()
radio = tagged(music)
output.dummy(radio)
