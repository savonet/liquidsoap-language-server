s = sine(amplitude=0.5, 440.)
t = sine(440., duration=2.)
u = sine("(not a call", duration=1.)
def f(sine) =
  sine(1)
end
# output.dummy(s)
v = [amplify(1., s)]
print((s, t, u, f, v))

#? signature 1:9
#? signature 1:24
#? signature 2:15
#? signature 3:33
#? signature 5:7
#? signature 7:15
#? signature 8:18
#? signature 9:0
