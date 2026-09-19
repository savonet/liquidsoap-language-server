def gain(s) = 💣() end
amplify; 💣()

def tagged(s) =
s = gain(s)
metadata.map(fun (m) -> [("station", "demo")], s)
end

music = sine()
radio = tagged(music)
output.dummy(radio)
