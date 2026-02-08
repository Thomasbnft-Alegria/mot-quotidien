import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get current date in Europe/Paris timezone as YYYY-MM-DD string
function getParisDateString(): string {
  const now = new Date();
  // Format in Paris timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // Returns YYYY-MM-DD format
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const todayParis = getParisDateString();
    console.log(`Getting daily word for Paris date: ${todayParis}`);

    // Step 1: Check if we already have a word for today
    const { data: todayWord, error: fetchError } = await supabase
      .from("words")
      .select("*")
      .eq("date_shown", todayParis)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is expected if no word set for today
      console.error("Error fetching today's word:", fetchError);
      throw fetchError;
    }

    // If we found a word for today, return it
    if (todayWord) {
      console.log(`Found existing word for today: ${todayWord.word}`);
      return new Response(
        JSON.stringify({
          success: true,
          word: {
            id: todayWord.id,
            word: todayWord.word,
            definition: todayWord.definition,
            exampleSentence: todayWord.example_sentence,
            category: todayWord.category,
            register: todayWord.register,
          },
          date: todayParis,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: No word for today - select next unshown word (by display_order)
    console.log("No word for today, selecting next unshown word...");
    
    const { data: nextWord, error: nextError } = await supabase
      .from("words")
      .select("*")
      .is("date_shown", null)
      .order("display_order", { ascending: true })
      .limit(1)
      .single();

    if (nextError && nextError.code !== "PGRST116") {
      console.error("Error fetching next word:", nextError);
      throw nextError;
    }

    // If no unshown words, cycle back to the oldest shown word
    let selectedWord = nextWord;
    if (!selectedWord) {
      console.log("All words shown, cycling back to oldest...");
      const { data: oldestWord, error: oldestError } = await supabase
        .from("words")
        .select("*")
        .order("date_shown", { ascending: true })
        .limit(1)
        .single();

      if (oldestError) {
        console.error("Error fetching oldest word:", oldestError);
        throw oldestError;
      }
      selectedWord = oldestWord;
    }

    if (!selectedWord) {
      throw new Error("No words available in database");
    }

    // Step 3: Update the selected word's date_shown to today
    console.log(`Setting date_shown for word: ${selectedWord.word}`);
    const { error: updateError } = await supabase
      .from("words")
      .update({ date_shown: todayParis })
      .eq("id", selectedWord.id);

    if (updateError) {
      console.error("Error updating word date_shown:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        word: {
          id: selectedWord.id,
          word: selectedWord.word,
          definition: selectedWord.definition,
          exampleSentence: selectedWord.example_sentence,
          category: selectedWord.category,
          register: selectedWord.register,
        },
        date: todayParis,
        isNew: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-daily-word:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
