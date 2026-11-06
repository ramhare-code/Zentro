import { describe, expect, it } from "vitest";
import { listingQueryString, parseListingParams, queryTokens } from "@/lib/listing-params";

describe("parseListingParams", () => {
  it("applies defaults", () => {
    const f = parseListingParams({});
    expect(f).toMatchObject({ brands: [], inStock: false, sort: "popularity", page: 1 });
    expect(f.q).toBeUndefined();
  });

  it("defaults to relevance when there is a query", () => {
    expect(parseListingParams({ q: "  wireless   headphones " })).toMatchObject({ q: "wireless headphones", sort: "relevance" });
  });

  it("drops relevance sort without a query", () => {
    expect(parseListingParams({ sort: "relevance" }).sort).toBe("popularity");
  });

  it("rejects unsafe or invalid values", () => {
    const f = parseListingParams({
      brand: ["aurora-audio,'; drop table x;--", "pulse-labs"],
      min: "abc",
      max: "-5",
      rating: "9",
      sort: "price; delete",
      page: "0",
      category: "../etc",
    });
    expect(f.brands).toEqual(["aurora-audio", "pulse-labs"]);
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
    expect(f.minRating).toBeUndefined();
    expect(f.sort).toBe("popularity");
    expect(f.page).toBe(1);
    expect(f.category).toBeUndefined();
  });

  it("swaps an inverted price range", () => {
    expect(parseListingParams({ min: "5000", max: "1000" })).toMatchObject({ minPrice: 1000, maxPrice: 5000 });
  });

  it("caps query length", () => {
    expect(parseListingParams({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("listingQueryString", () => {
  it("round-trips and omits defaults", () => {
    const f = parseListingParams({ q: "lamp", brand: "lumen-home", min: "100", instock: "1", page: "2" });
    expect(listingQueryString(f)).toBe("?q=lamp&brand=lumen-home&min=100&instock=1&page=2");
    expect(listingQueryString(f, { page: 1 })).toBe("?q=lamp&brand=lumen-home&min=100&instock=1");
    expect(listingQueryString(parseListingParams({}))).toBe("");
  });
});

describe("queryTokens", () => {
  it("keeps only alphanumeric tokens", () => {
    expect(queryTokens("Café  head-phones:* & | !")).toEqual(["cafe", "head", "phones"]);
  });
});
