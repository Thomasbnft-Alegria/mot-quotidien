import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DailyWord from "./pages/DailyWord";
import Quiz from "./pages/Quiz";
import WeeklyReview from "./pages/WeeklyReview";
import ProgressPage from "./pages/ProgressPage";
import NotFound from "./pages/NotFound";
import { useServiceWorker } from "./hooks/useServiceWorker";

const queryClient = new QueryClient();

const App = () => {
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DailyWord />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/revision" element={<WeeklyReview />} />
            <Route path="/progress" element={<ProgressPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
