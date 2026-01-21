import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, X, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  images: string[];
  is_featured: boolean;
  category_id: string | null;
  unit_type: string | null;
  unit_value: number | null;
  categories: {
    name: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "");

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchParams]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id")
      .eq("is_active", true)
      .order("display_order");

    if (!error && data) {
      setCategories(data);
    }
  };

  // Organize categories hierarchically
  const getHierarchicalCategories = () => {
    const parents = categories.filter(c => !c.parent_id);
    const result: { category: Category; children: Category[] }[] = [];
    parents.forEach(parent => {
      const children = categories.filter(c => c.parent_id === parent.id);
      result.push({ category: parent, children });
    });
    return result;
  };

  const fetchProducts = async () => {
    setLoading(true);
    
    let query = supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        price,
        compare_at_price,
        member_price,
        images,
        is_featured,
        category_id,
        unit_type,
        unit_value,
        categories (name)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    // Filter by category
    const categorySlug = searchParams.get("category");
    if (categorySlug) {
      const category = categories.find((c) => c.slug === categorySlug);
      if (category) {
        query = query.eq("category_id", category.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching products:", error);
    } else {
      // Filter by search query client-side for simplicity
      const searchTerm = searchParams.get("search")?.toLowerCase() || "";
      const filtered = searchTerm
        ? data?.filter(
            (p) =>
              p.name.toLowerCase().includes(searchTerm) ||
              p.categories?.name.toLowerCase().includes(searchTerm)
          )
        : data;
      setProducts(filtered || []);
    }
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    } else {
      params.delete("search");
    }
    setSearchParams(params);
  };

  const handleCategorySelect = (slug: string) => {
    const params = new URLSearchParams(searchParams);
    if (slug === selectedCategory) {
      params.delete("category");
      setSelectedCategory("");
    } else {
      params.set("category", slug);
      setSelectedCategory(slug);
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setSearchParams({});
  };

  const hasFilters = searchParams.get("search") || searchParams.get("category");

  const FilterSidebar = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-3">Categories</h3>
        <div className="space-y-1">
          {getHierarchicalCategories().map(({ category: parent, children }) => (
            <div key={parent.id}>
              <button
                onClick={() => handleCategorySelect(parent.slug)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors font-medium ${
                  selectedCategory === parent.slug
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {parent.name}
              </button>
              {children.length > 0 && (
                <div className="ml-4 border-l pl-2 mt-1 space-y-1">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => handleCategorySelect(child.slug)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors text-sm ${
                        selectedCategory === child.slug
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Our Products
          </h1>
          <p className="text-muted-foreground">
            Discover our wide range of authentic Indian snacks
          </p>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>

          {/* Mobile Filter Button */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <FilterSidebar />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active Filters */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {searchParams.get("search") && (
              <Badge variant="secondary" className="gap-1">
                Search: {searchParams.get("search")}
                <button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.delete("search");
                    setSearchQuery("");
                    setSearchParams(params);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchParams.get("category") && (
              <Badge variant="secondary" className="gap-1">
                Category: {categories.find((c) => c.slug === searchParams.get("category"))?.name}
                <button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.delete("category");
                    setSelectedCategory("");
                    setSearchParams(params);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <FilterSidebar />
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-square w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  No products found
                </h3>
                <p className="text-muted-foreground mb-6">
                  Try adjusting your search or filters
                </p>
                <Button onClick={clearFilters}>Clear Filters</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Showing {products.length} product{products.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      slug={product.slug}
                      price={product.price}
                      memberPrice={product.member_price}
                      originalPrice={product.compare_at_price || undefined}
                      image={product.images?.[0] || "/placeholder.svg"}
                      category={product.categories?.name || "Snacks"}
                      isBestSeller={product.is_featured}
                      unitType={product.unit_type}
                      unitValue={product.unit_value}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <AdvertisementBanner placement="products_bottom" />
      <Footer />
    </div>
  );
};

export default Products;
