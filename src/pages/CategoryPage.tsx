import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
  gst_percentage: number | null;
  gst_inclusive: boolean | null;
  categories: {
    name: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
}

const CategoryPage = () => {
  const { slug, subSlug } = useParams<{ slug: string; subSlug?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const currentSlug = subSlug || slug;

  useEffect(() => {
    if (currentSlug) {
      fetchCategoryData();
    }
  }, [currentSlug, slug, subSlug]);

  const fetchCategoryData = async () => {
    setLoading(true);

    // Fetch the current category
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("*")
      .eq("slug", currentSlug)
      .eq("is_active", true)
      .single();

    if (categoryError || !categoryData) {
      console.error("Error fetching category:", categoryError);
      setLoading(false);
      return;
    }

    setCategory(categoryData);

    // If this is a subcategory, fetch the parent
    if (categoryData.parent_id) {
      const { data: parentData } = await supabase
        .from("categories")
        .select("*")
        .eq("id", categoryData.parent_id)
        .single();
      
      if (parentData) {
        setParentCategory(parentData);
      }
    } else {
      setParentCategory(null);
      
      // Fetch subcategories for parent categories
      const { data: subCats } = await supabase
        .from("categories")
        .select("*")
        .eq("parent_id", categoryData.id)
        .eq("is_active", true)
        .order("display_order");
      
      setSubCategories(subCats || []);
    }

    // Fetch products for this category
    // If it's a parent category, also include products from subcategories
    let productQuery = supabase
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
        gst_percentage,
        gst_inclusive,
        categories (name)
      `)
      .eq("is_active", true);

    if (categoryData.parent_id) {
      // It's a subcategory, only get products from this category
      productQuery = productQuery.eq("category_id", categoryData.id);
    } else {
      // It's a parent category, get products from this category and all subcategories
      const { data: subCatData } = await supabase
        .from("categories")
        .select("id")
        .eq("parent_id", categoryData.id);
      
      const subCatIds = subCatData?.map(c => c.id) || [];
      const allCategoryIds = [categoryData.id, ...subCatIds];
      
      productQuery = productQuery.in("category_id", allCategoryIds);
    }

    const { data: productsData, error: productsError } = await productQuery.order("created_at", { ascending: false });

    if (productsError) {
      console.error("Error fetching products:", productsError);
    } else {
      setProducts(productsData || []);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/products">Products</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {parentCategory && (
              <>
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/category/${parentCategory.slug}`}>
                      {parentCategory.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{category?.name || "Category"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Category Header */}
        <div className="mb-8">
          {category?.image_url && (
            <div className="relative h-48 md:h-64 rounded-xl overflow-hidden mb-6">
              <img
                src={category.image_url}
                alt={category.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              <div className="absolute bottom-4 left-4">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                  {category.name}
                </h1>
              </div>
            </div>
          )}
          {!category?.image_url && (
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              {category?.name || "Category"}
            </h1>
          )}
          {category?.description && (
            <p className="text-muted-foreground">{category.description}</p>
          )}
        </div>

        {/* Subcategories (if parent category) */}
        {subCategories.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Browse Subcategories
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {subCategories.map((subCat) => (
                <Link
                  key={subCat.id}
                  to={`/category/${slug}/${subCat.slug}`}
                  className="group p-4 rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all bg-card"
                >
                  {subCat.image_url ? (
                    <img
                      src={subCat.image_url}
                      alt={subCat.name}
                      className="w-full aspect-square object-cover rounded-lg mb-2 group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-muted rounded-lg mb-2 flex items-center justify-center">
                      <span className="text-3xl">📦</span>
                    </div>
                  )}
                  <p className="font-medium text-foreground text-center text-sm group-hover:text-primary transition-colors">
                    {subCat.name}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {subCategories.length > 0 ? "All Products" : "Products"}
          </h2>
          
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No products found
              </h3>
              <p className="text-muted-foreground">
                Check back soon for new products in this category
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Showing {products.length} product{products.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
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
                    gstPercentage={product.gst_percentage}
                    gstInclusive={product.gst_inclusive}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <AdvertisementBanner placement="products_bottom" />
      <Footer />
    </div>
  );
};

export default CategoryPage;
