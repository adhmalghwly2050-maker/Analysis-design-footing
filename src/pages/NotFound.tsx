import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 font-sans text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">404 - الصفحة غير موجودة</h1>
      <p className="text-gray-600 mb-6 font-medium">عذراً، لم نتمكن من العثور على الصفحة المطلوبة.</p>
      <Link to="/">
        <Button className="font-semibold px-6 py-2">
          العودة للرئيسية
        </Button>
      </Link>
    </div>
  );
}
