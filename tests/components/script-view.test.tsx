import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScriptView } from "@/components/script-view";

describe("ScriptView", () => {
  it("affiche le script quand il est fourni", () => {
    render(<ScriptView script="Voici le contenu du script audio." />);
    expect(
      screen.getByText("Voici le contenu du script audio."),
    ).toBeInTheDocument();
  });

  it("affiche un message d'erreur quand le script est null", () => {
    render(<ScriptView script={null} />);
    expect(
      screen.getByText("Aucun script n'a été généré pour ce projet."),
    ).toBeInTheDocument();
  });

  it("rend le contenu dans un article quand le script existe", () => {
    render(<ScriptView script="Contenu test" />);
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent("Contenu test");
  });

  it("n'affiche pas d'article quand le script est null", () => {
    render(<ScriptView script={null} />);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
