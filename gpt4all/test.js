import {createCompletion, loadModel} from "gpt4all";

const model = await loadModel("orca-mini-3b-gguf2-q4_0.gguf");

// createCompletion methods can also be used on the model directly.
// context is not maintained between completions.
const res1 = await createCompletion(model, "What is 1 + 1?");
console.debug(res1.choices[0].message);

// a whole conversation can be input as well.
// note that if the last message is not of role 'user', an error will be thrown.
const res2 = await createCompletion(model, [
    {
        role: "user",
        content: "What is 2 + 2?",
    },
    {
        role: "assistant",
        content: "It's 5.",
    },
    {
        role: "user",
        content: "Could you recalculate that?",
    },
]);
console.debug(res2.choices[0].message);